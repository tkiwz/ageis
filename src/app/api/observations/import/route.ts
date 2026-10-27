/**
 * POST /api/observations/import  (multipart: file, optional siteId)
 *
 * Imports safety observations from whatever spreadsheet the user has — no
 * template. The sheet, header row and columns are detected (Arabic or English
 * headers, any order, AI fallback for odd names), each row's site is matched by
 * code or name within the caller's site scope, then AEGIS summarises the data.
 *
 * Returns: { imported, skipped, errors[], analysis, detected: { sheet, headerRow, columns } }
 */
import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { aiGuard } from "@/lib/security/ai-guard";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { getLocale } from "@/lib/i18n/server";
import { cellText, mapColumns, matchName, norm, parseDate, readTable, type FieldSpec } from "@/lib/import/smart-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

const FIELDS: FieldSpec[] = [
  { key: "findings", kind: "longtext", required: true, synonyms: ["findings", "finding", "observation", "description", "details of observation", "what was observed", "notes", "comments", "remarks", "الملاحظة", "الملاحظات", "الوصف", "وصف الملاحظة", "النتائج", "المشاهدة", "ما تمت ملاحظته"] },
  { key: "type", synonyms: ["type", "observation type", "category", "classification", "kind", "النوع", "نوع الملاحظة", "الفئة", "التصنيف"] },
  { key: "location", synonyms: ["location", "place", "area", "exact location", "unit", "الموقع", "المكان", "المنطقة", "الوحدة", "موقع الملاحظة"] },
  { key: "site", synonyms: ["site", "field", "facility", "asset", "plant", "station", "الحقل", "المنشأة", "المحطة", "الموقع الرئيسي", "اسم الموقع"] },
  { key: "unsafeDetail", synonyms: ["unsafe detail", "detail", "details", "hazard", "risk", "corrective action", "action taken", "التفاصيل", "الخطر", "الإجراء", "الإجراء التصحيحي", "الإجراء المتخذ"] },
  { key: "contractor", synonyms: ["contractor", "company", "vendor", "subcontractor", "المقاول", "الشركة", "المقاول المنفذ"] },
  { key: "observedAt", kind: "date", synonyms: ["date", "observed at", "observation date", "date observed", "reported date", "التاريخ", "تاريخ الملاحظة", "تاريخ الرصد", "التاريخ والوقت"] },
  { key: "status", synonyms: ["status", "state", "open closed", "الحالة", "الوضع"] },
];

function mapType(raw: string): string {
  const v = norm(raw);
  if (!v) return "UNSAFE_CONDITION";
  if (/nearmiss|nm$|^nm|شبهحادث|حادثوشيك|حادثهقريبه|كادان/.test(v)) return "NEAR_MISS";
  if (/unsafeact|^ua$|behavio|فعلغيرامن|تصرفغيرامن|سلوك/.test(v)) return "UNSAFE_ACT";
  if (/positive|^pos$|goodpractice|safeact|ايجابي|ممارسهامنه|ممارسهجيده/.test(v)) return "POSITIVE";
  return "UNSAFE_CONDITION";
}

function mapStatus(raw: string): string {
  const v = norm(raw);
  return /resolv|closed|close|done|complete|مغلق|محلول|منجز|مكتمل|تمالاغلاق/.test(v) ? "RESOLVED" : "OPEN";
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  const limited = await aiGuard("analyze");
  if (limited) return limited;

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("INVALID_FORM", "Could not read the upload", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("NO_FILE", "No file provided", 400);
  if (file.size > MAX_BYTES) return fail("TOO_LARGE", "File is larger than 10 MB", 400);

  // Sites the caller may write to; rows are matched against these only
  const sites = await db.site.findMany({
    where: scope.where("id"),
    select: { id: true, code: true, name: true, nameAr: true },
    orderBy: { code: "asc" },
  });
  if (sites.length === 0) return fail("NO_SITE", "You don't have access to any site", 403);
  const chosen = form.get("siteId");
  const fallbackSite = typeof chosen === "string" && chosen ? sites.find((s) => s.id === chosen) : sites[0];
  if (!fallbackSite) return fail("NOT_FOUND", "Site not found", 404);

  let table;
  try {
    table = await readTable(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    return fail("UNREADABLE", "Couldn't find a table in this file", 400);
  }
  if (table.rows.length === 0) return fail("EMPTY_FILE", "The file has a header but no data rows", 400);

  const { map, via } = await mapColumns(table, FIELDS, { ai: true });
  if (!("findings" in map)) {
    return fail("NO_FINDINGS_COLUMN", "Couldn't tell which column holds the observation text", 400);
  }
  const get = (row: (typeof table.rows)[number], key: string) => (key in map ? row[map[key]] : null);

  // Record numbers: one batch prefix so concurrent imports can't collide
  const batch = `OBS-IMP-${Date.now().toString(36).toUpperCase()}`;
  const errors: { row: number; reason: string }[] = [];
  const data: {
    recordNumber: string; type: string; status: string; location: string; findings: string;
    unsafeDetail: string | null; contractor: string | null; observedAt: Date; siteId: string; reportedById: string;
  }[] = [];
  let unmatchedSites = 0;

  table.rows.forEach((row, i) => {
    const line = table.lines[i];
    const findings = cellText(get(row, "findings"));
    if (!findings) { errors.push({ row: line, reason: "EMPTY_TEXT" }); return; }
    const siteRaw = cellText(get(row, "site")) || cellText(get(row, "location"));
    const site = (siteRaw && matchName(siteRaw, sites, (s) => [s.code, s.name, s.nameAr])) || null;
    if (siteRaw && !site && "site" in map) unmatchedSites++;
    data.push({
      recordNumber: `${batch}-${String(data.length + 1).padStart(4, "0")}`,
      type: mapType(cellText(get(row, "type"))),
      status: mapStatus(cellText(get(row, "status"))),
      location: (cellText(get(row, "location")) || siteRaw || "—").slice(0, 300),
      findings: findings.slice(0, 5000),
      unsafeDetail: cellText(get(row, "unsafeDetail")).slice(0, 2000) || null,
      contractor: cellText(get(row, "contractor")).slice(0, 200) || null,
      observedAt: parseDate(get(row, "observedAt")) ?? new Date(),
      siteId: (site ?? fallbackSite).id,
      reportedById: scope.userId,
    });
  });

  if (data.length) await db.observation.createMany({ data });

  const locale = await getLocale();
  const isAr = locale === "ar";
  let analysis = "";
  if (data.length) {
    const count = <K extends string>(xs: K[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
    const types = count(data.map((d) => d.type)).map(([k, n]) => `${k}: ${n}`).join(" | ");
    const places = count(data.map((d) => d.location)).slice(0, 5).map(([k, n]) => `${k} (${n})`).join(", ");
    const samples = data.slice(0, 12).map((d, i) => `  ${i + 1}. ${d.findings.slice(0, 160)}`).join("\n");
    try {
      const res = await claudeChat({
        system: `You are AEGIS, an HSSE safety analyst for oil & gas in Oman. Be concise and specific.${isAr ? " Reply in Arabic (Gulf/MSA), with English technical terms in brackets only where needed." : ""}`,
        messages: [{
          role: "user",
          content: `Analyse ${data.length} imported safety observations.\nTypes: ${types}\nTop locations: ${places}\nSamples:\n${samples}\n\n` +
            "Give: 1) key recurring patterns (3-4 bullets) 2) highest-risk locations (top 3, why) 3) the most serious findings 4) 3-4 concrete actions 5) overall assessment in 2 sentences with a risk level (LOW/MEDIUM/HIGH/CRITICAL).",
        }],
        maxTokens: 900,
        glmModel: isAr ? process.env.GLM_BRIEF_MODEL ?? "glm-4.6" : undefined,
      });
      analysis = res.content;
    } catch {
      analysis = "";
    }
  }

  await appendAuditLog({
    action: "OBSERVATIONS_IMPORTED", module: "SAFETY", actionType: "MANUAL",
    description: `Imported ${data.length} observations from ${file.name}`,
    userId: scope.userId,
    metadata: JSON.stringify({ fileName: file.name, sheet: table.sheet, imported: data.length, skipped: errors.length, batch }),
  }).catch(() => {});

  return ok({
    imported: data.length,
    skipped: errors.length,
    errors: errors.slice(0, 100),
    analysis,
    detected: {
      sheet: table.sheet,
      headerRow: table.headerRow,
      totalRows: table.rows.length,
      unmatchedSites,
      fallbackSite: fallbackSite.code,
      columns: Object.fromEntries(Object.entries(map).map(([k, col]) => [k, { header: table.headers[col] || `#${col + 1}`, via: via[k] }])),
    },
  });
}
