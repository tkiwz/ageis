/**
 * Document text extraction — gracefully degrades.
 *
 * Supported out of the box:
 *   - Plain text (.txt, .md, .csv) — straight read
 *   - HTML — strip tags
 *   - PDF — best-effort heuristic (extracts text from uncompressed streams);
 *           for full PDF support, run `npm install pdf-parse` and the loader
 *           below will pick it up via dynamic import.
 *
 * Office docs (.docx, .xlsx) — not supported here; client should paste text.
 */

const MAX_EXTRACT_BYTES = 5 * 1024 * 1024; // 5 MB cap

export interface ExtractionResult {
  ok: boolean;
  text: string;
  truncated: boolean;
  warnings: string[];
}

export async function extractDocumentText(
  filename: string,
  buffer: Buffer,
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  let truncated = false;

  if (buffer.length > MAX_EXTRACT_BYTES) {
    buffer = buffer.subarray(0, MAX_EXTRACT_BYTES);
    truncated = true;
    warnings.push(`File truncated to ${MAX_EXTRACT_BYTES} bytes for extraction.`);
  }

  const lower = filename.toLowerCase();

  // ─── Plain text family ───
  if (/\.(txt|md|csv|tsv|log|json|yml|yaml)$/.test(lower)) {
    return {
      ok: true,
      text: buffer.toString("utf8"),
      truncated,
      warnings,
    };
  }

  // ─── HTML ───
  if (/\.(html?|xml)$/.test(lower)) {
    const raw = buffer.toString("utf8");
    const stripped = raw.replace(/<style[\s\S]*?<\/style>/gi, " ")
                         .replace(/<script[\s\S]*?<\/script>/gi, " ")
                         .replace(/<[^>]+>/g, " ")
                         .replace(/\s+/g, " ")
                         .trim();
    return { ok: true, text: stripped, truncated, warnings };
  }

  // ─── PDF ───
  if (lower.endsWith(".pdf")) {
    // Prefer pdf-parse if available (full support)
    try {
      // Dynamic import — silently skipped if package isn't installed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = (await import("pdf-parse" as any)).default;
      const parsed = await pdfParse(buffer);
      return {
        ok: true,
        text: parsed.text ?? "",
        truncated,
        warnings,
      };
    } catch {
      warnings.push("pdf-parse not installed — using heuristic text extractor (may miss content).");
    }

    // Fallback: dumb heuristic — extract any printable ASCII / UTF-8 substrings
    const text = buffer.toString("latin1")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, " ")
      .replace(/[^\x20-\x7e؀-ۿ\s]/g, " ")
      .replace(/\s{3,}/g, "\n")
      .replace(/(.)\1{10,}/g, "")
      .trim();

    if (text.length < 50) {
      return {
        ok: false,
        text: "",
        truncated,
        warnings: [...warnings, "PDF appears to use compressed text streams. Install pdf-parse for full support, or paste the text content manually."],
      };
    }
    return { ok: true, text, truncated, warnings };
  }

  // ─── Word/Excel — not supported ───
  if (/\.(docx?|xlsx?|pptx?)$/.test(lower)) {
    return {
      ok: false,
      text: "",
      truncated,
      warnings: [
        ...warnings,
        "Microsoft Office files aren't parsed yet. Please convert to PDF or paste the text manually.",
      ],
    };
  }

  // ─── Unknown — try as UTF-8 ───
  const guess = buffer.toString("utf8");
  if (/[\x20-\x7e؀-ۿ]/.test(guess.slice(0, 200))) {
    return { ok: true, text: guess, truncated, warnings: [...warnings, "Unknown file type — read as plain text."] };
  }

  return {
    ok: false,
    text: "",
    truncated,
    warnings: [...warnings, `Unsupported file type: ${filename}`],
  };
}
