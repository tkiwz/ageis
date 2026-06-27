/**
 * POST /api/observations/import
 *
 * Accepts an Excel (.xlsx / .xls) or CSV file, parses it, imports rows
 * into the Observation table, then asks AEGIS AI to analyze the data.
 *
 * Auto-detects column headers in Arabic or English.
 * Returns: { imported, skipped, errors[], analysis }
 */

import { NextRequest }  from "next/server";
import { auth }         from "@/auth";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";
import { claudeChat }   from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Column header normaliser ─────────────────────────────────
function normalise(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[\s_\-\/]/g, "");
}

// Maps a normalised header → our field name
const HEADER_MAP: Record<string, string> = {
  // type
  "type": "type", "observationtype": "type", "category": "type",
  "النوع": "type", "نوعالملاحظة": "type", "الفئة": "type",
  // location
  "location": "location", "place": "location", "area": "location", "site": "location",
  "الموقع": "location", "المكان": "location", "المنطقة": "location",
  // findings
  "findings": "findings", "observation": "findings", "description": "findings",
  "notes": "findings", "finding": "findings",
  "الملاحظة": "findings", "الملاحظات": "findings", "الوصف": "findings", "النتائج": "findings",
  // unsafeDetail
  "unsafedetail": "unsafeDetail", "detail": "unsafeDetail", "details": "unsafeDetail",
  "التفاصيل": "unsafeDetail", "تفاصيلالحالة": "unsafeDetail",
  // contractor
  "contractor": "contractor", "company": "contractor", "vendor": "contractor",
  "المقاول": "contractor", "الشركة": "contractor",
  // observedAt
  "date": "observedAt", "observedat": "observedAt", "observeddate": "observedAt",
  "التاريخ": "observedAt", "تاريخالملاحظة": "observedAt",
  // status
  "status": "status", "الحالة": "status",
};

// Type value normaliser → enum
function mapType(raw: string): string {
  const v = normalise(raw);
  if (v.includes("unsafecondition") || v.includes("حالةغيرآمنة") || v === "uc") return "UNSAFE_CONDITION";
  if (v.includes("unsafeact")       || v.includes("فعلغيرآمن")   || v === "ua") return "UNSAFE_ACT";
  if (v.includes("nearmiss")        || v.includes("حادثةقريبة")   || v === "nm") return "NEAR_MISS";
  if (v.includes("positive")        || v.includes("إيجابي")       || v === "pos") return "POSITIVE";
  return "UNSAFE_CONDITION"; // default
}

function mapStatus(raw: string): string {
  const v = normalise(raw);
  if (v.includes("resolv") || v.includes("محلول") || v.includes("مغلق") || v.includes("closed")) return "RESOLVED";
  return "OPEN";
}

// ─── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  // Resolve reporter + default site
  const reporter = await db.user.findFirst({
    where: { OR: [{ id: session.user.id }, { email: session.user.email ?? "" }] },
  });
  if (!reporter) return fail("NO_USER", "User not found", 400);

  const defaultSite = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  if (!defaultSite) return fail("NO_SITE", "No site found", 400);

  // ── Parse form data ────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return fail("INVALID_FORM", "Could not parse form data", 400); }

  const file = formData.get("file") as File | null;
  if (!file) return fail("NO_FILE", "No file provided", 400);

  const fileName  = file.name.toLowerCase();
  const isExcel   = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
  const isCsv     = fileName.endsWith(".csv");
  if (!isExcel && !isCsv) return fail("UNSUPPORTED", "Only .xlsx, .xls, .csv files supported", 400);

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Parse rows ─────────────────────────────────────────────
  let rows: Record<string, string>[] = [];

  if (isCsv) {
    // ── CSV parsing (no dependency) ──────────────────────────
    const text   = buffer.toString("utf-8");
    const lines  = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return fail("EMPTY_FILE", "File has no data rows", 400);

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
      rows.push(row);
    }
  } else {
    // ── Excel parsing ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let XLSX: any;
    try {
      // xlsx is an optional dependency — gracefully fail if not installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      XLSX = await import("xlsx" as string);
    } catch {
      return fail(
        "MISSING_DEPENDENCY",
        "xlsx package not installed. Run: npm install xlsx",
        500,
      );
    }

    const workbook  = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, string>[];
  }

  if (rows.length === 0) return fail("EMPTY_FILE", "No data rows found in file", 400);

  // ── Map column headers ─────────────────────────────────────
  const firstRow    = rows[0];
  const rawHeaders  = Object.keys(firstRow);
  const fieldMap: Record<string, string> = {}; // rawHeader → fieldName

  for (const h of rawHeaders) {
    const mapped = HEADER_MAP[normalise(h)];
    if (mapped) fieldMap[h] = mapped;
  }

  // ── Import rows ────────────────────────────────────────────
  const imported: string[] = [];
  const skipped:  { row: number; reason: string }[] = [];
  const count = await db.observation.count();
  let   rowIdx = 0;

  for (const raw of rows) {
    rowIdx++;
    const get = (field: string): string => {
      const header = Object.keys(fieldMap).find((h) => fieldMap[h] === field);
      return header ? String(raw[header] ?? "").trim() : "";
    };

    const findings = get("findings");
    const location = get("location") || "Unspecified";
    if (!findings) { skipped.push({ row: rowIdx, reason: "Missing findings/description" }); continue; }

    const rawDate = get("observedAt");
    let   observedAt = new Date();
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) observedAt = parsed;
    }

    const recordNumber = `OBS-${new Date().getFullYear()}-IMP-${String(count + imported.length + 1).padStart(4, "0")}`;

    try {
      await db.observation.create({
        data: {
          recordNumber,
          type:          mapType(get("type") || "UNSAFE_CONDITION"),
          status:        mapStatus(get("status") || "OPEN"),
          location,
          findings,
          unsafeDetail:  get("unsafeDetail")  || null,
          contractor:    get("contractor")    || null,
          observedAt,
          siteId:        defaultSite.id,
          reportedById:  reporter.id,
        },
      });
      imported.push(recordNumber);
    } catch (e) {
      skipped.push({ row: rowIdx, reason: String(e) });
    }
  }

  // ── AI Analysis ───────────────────────────────────────────
  let analysis = "";
  if (imported.length > 0) {
    try {
      // Build a data summary for Claude
      const typeCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};
      const sampleFindings: string[] = [];

      for (const raw of rows.slice(0, 100)) {
        const get = (field: string): string => {
          const header = Object.keys(fieldMap).find((h) => fieldMap[h] === field);
          return header ? String(raw[header] ?? "").trim() : "";
        };
        const t = mapType(get("type") || "UNSAFE_CONDITION");
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        const loc = get("location") || "Unspecified";
        locationCounts[loc] = (locationCounts[loc] ?? 0) + 1;
        const f = get("findings");
        if (f && sampleFindings.length < 10) sampleFindings.push(f.slice(0, 150));
      }

      const topLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([loc, n]) => `${loc} (${n})`)
        .join(", ");

      const typeBreakdown = Object.entries(typeCounts)
        .map(([t, n]) => `${t}: ${n}`)
        .join(" | ");

      const prompt = `You are AEGIS Safety Intelligence. Analyze these ${imported.length} safety observations imported from historical records.

DATA SUMMARY:
- Total imported: ${imported.length}
- Types: ${typeBreakdown}
- Top locations: ${topLocations}
- Sample findings (first 10):
${sampleFindings.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}

Provide a structured safety analysis with:
1. **Key Patterns** — 3-4 bullet points on recurring issues
2. **Highest Risk Locations** — top 3 with brief reason
3. **Critical Unsafe Conditions** — most serious findings
4. **Immediate Recommended Actions** — 3-4 specific actions
5. **Overall Safety Assessment** — 2-3 sentence summary with risk level (LOW/MEDIUM/HIGH/CRITICAL)

Be direct, specific, and actionable. Use the data provided.`;

      const result = await claudeChat({
        system:    "You are AEGIS, an autonomous HSSE safety intelligence system. Provide concise, professional safety analysis in English.",
        messages:  [{ role: "user", content: prompt }],
        maxTokens: 800,
      });
      analysis = result.content;
    } catch {
      analysis = "AI analysis unavailable — check ANTHROPIC_API_KEY in your .env file.";
    }
  }

  // ── Audit log ─────────────────────────────────────────────
  await db.auditLog.create({
    data: {
      action:      "OBSERVATIONS_IMPORTED",
      module:      "SAFETY",
      actionType:  "MANUAL",
      description: `Imported ${imported.length} observations from file: ${file.name}`,
      userId:      reporter.id,
      metadata:    JSON.stringify({ fileName: file.name, imported: imported.length, skipped: skipped.length }),
    },
  }).catch(() => {});

  return ok({ imported: imported.length, skipped: skipped.length, errors: skipped, analysis });
}
