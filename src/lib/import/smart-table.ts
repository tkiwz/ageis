/**
 * Reads any spreadsheet people actually have — no template.
 *
 *  - Excel (.xlsx/.xls/.xlsm/.ods) or delimited text (.csv/.tsv/.txt)
 *  - picks the sheet that holds the data, skips title rows above the header
 *  - CSV: detects , ; tab | and UTF-8 vs Windows-1256 (Arabic Excel exports)
 *  - matches columns by Arabic/English synonyms, then by what the values look
 *    like, and finally asks the AI for anything still unmatched.
 */
import { claudeChat } from "@/lib/ai/claude-client";

export type Cell = string | number | boolean | Date | null;
/** headerRow and lines are 1-based line numbers in the file, so errors can point at the right row. */
export interface Table { sheet: string | null; headerRow: number; headers: string[]; rows: Cell[][]; lines: number[] }

export interface FieldSpec {
  key: string;
  /** Header words that mean this field (any language, any spacing) */
  synonyms: string[];
  kind?: "text" | "longtext" | "date";
  required?: boolean;
}
export type ColumnMap = Record<string, number>;
export interface MapResult { map: ColumnMap; via: Record<string, "header" | "values" | "ai"> }

export const MAX_ROWS = 5000;

// ── Text normalisation (Arabic-aware) ───────────────────────
const AR_INDIC = /[٠-٩۰-۹]/g;
export function toLatinDigits(s: string): string {
  return s.replace(AR_INDIC, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}
export function norm(s: unknown): string {
  return toLatinDigits(String(s ?? ""))
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // diacritics, tatweel
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/^ال/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

// ── Reading ─────────────────────────────────────────────────
export async function readTable(buf: Buffer, fileName: string): Promise<Table> {
  const name = fileName.toLowerCase();
  const isText = /\.(csv|tsv|txt)$/.test(name) || !looksLikeZipOrOle(buf);
  const sheets: { name: string | null; grid: Cell[][] }[] = isText
    ? [{ name: null, grid: parseDelimited(decodeText(buf)) }]
    : await readWorkbook(buf);

  let best: Table | null = null;
  let bestScore = -1;
  for (const s of sheets) {
    const t = findHeader(s.grid);
    if (!t) continue;
    const score = t.rows.length * Math.max(1, t.headers.filter(Boolean).length);
    if (score > bestScore) { bestScore = score; best = { ...t, sheet: s.name }; }
  }
  if (!best) throw new Error("No table found in the file");
  return best;
}

function looksLikeZipOrOle(buf: Buffer) {
  return (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
}

async function readWorkbook(buf: Buffer) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  return wb.SheetNames.map((n) => ({
    name: n,
    grid: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, defval: null, raw: true, blankrows: true }),
  }));
}

function decodeText(buf: Buffer): string {
  let text = new TextDecoder("utf-8").decode(buf);
  // Lots of U+FFFD means it wasn't UTF-8: Arabic Windows exports are cp1256
  const bad = (text.match(/�/g) ?? []).length;
  if (bad > 3 && bad > text.length / 200) {
    try { text = new TextDecoder("windows-1256").decode(buf); } catch { /* keep utf-8 */ }
  }
  return text.replace(/^﻿/, "");
}

/** RFC-4180-ish parser with delimiter detection. */
export function parseDelimited(text: string): Cell[][] {
  const sample = text.split(/\r?\n/).slice(0, 20).filter((l) => l.trim());
  const delim = [",", ";", "\t", "|"]
    .map((d) => {
      const counts = sample.map((l) => l.split(d).length - 1);
      const nonZero = counts.filter((c) => c > 0);
      // Consistent column count across lines beats sheer frequency
      const mode = nonZero.sort((a, b) => nonZero.filter((x) => x === b).length - nonZero.filter((x) => x === a).length)[0] ?? 0;
      return { d, score: mode * nonZero.filter((c) => c === mode).length };
    })
    .sort((a, b) => b.score - a.score)[0].d;

  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell.trim() || null); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim() || null); cell = "";
      rows.push(row.some((c) => c !== null) ? row : []); // keep blank lines so line numbers stay true
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim() || null);
  if (row.some((c) => c !== null)) rows.push(row);
  return rows;
}

/** The header is the first row (of the top 25) that is mostly short text and has data under it. */
function findHeader(grid: Cell[][]): Omit<Table, "sheet"> | null {
  const width = Math.max(0, ...grid.slice(0, 50).map((r) => r.length));
  if (width === 0) return null;
  let bestIdx = -1, bestScore = 0;
  for (let i = 0; i < Math.min(25, grid.length - 1); i++) {
    const r = grid[i] ?? [];
    const filled = r.filter((c) => !isBlank(c));
    const texty = filled.filter((c) => typeof c === "string" && c.length <= 60 && !/^\d+([.,]\d+)?$/.test(toLatinDigits(c)));
    if (texty.length < 2) continue;
    const below = grid.slice(i + 1, i + 6).filter((x) => x.filter((c) => !isBlank(c)).length >= Math.min(2, texty.length)).length;
    const score = texty.length * 2 + filled.length + below * 2 - (filled.length - texty.length) * 2;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  const headers = Array.from({ length: width }, (_, j) => String(grid[bestIdx][j] ?? "").trim());
  const rows: Cell[][] = [];
  const lines: number[] = [];
  for (let i = bestIdx + 1; i < grid.length && rows.length < MAX_ROWS; i++) {
    if (!(grid[i] ?? []).some((c) => !isBlank(c))) continue;
    rows.push(grid[i]); lines.push(i + 1);
  }
  return { headerRow: bestIdx + 1, headers, rows, lines };
}

// ── Values ──────────────────────────────────────────────────
export function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** Excel serials, ISO, and day-first dates (the Gulf convention: 05/03/2024 = 5 March). */
export function parseDate(v: Cell): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)); // Excel serial
    return null;
  }
  const s = toLatinDigits(String(v ?? "")).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return valid(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly month-first
    return valid(y, mo, d, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
function valid(y: number, mo: number, d: number, h: number, mi: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
}

// ── Column mapping ──────────────────────────────────────────
export async function mapColumns(table: Table, fields: FieldSpec[], opts: { ai?: boolean } = {}): Promise<MapResult> {
  const map: ColumnMap = {};
  const via: MapResult["via"] = {};
  const used = new Set<number>();
  const H = table.headers.map(norm);

  // 1. Headers: exact synonym beats "contains"
  const scored: { key: string; col: number; score: number }[] = [];
  for (const f of fields) {
    const syns = f.synonyms.map(norm).filter(Boolean);
    H.forEach((h, col) => {
      if (!h) return;
      let score = 0;
      for (const s of syns) {
        if (h === s) score = Math.max(score, 3);
        else if (s.length >= 3 && (h.includes(s) || (h.length >= 4 && s.includes(h)))) score = Math.max(score, 2);
      }
      if (score) scored.push({ key: f.key, col, score });
    });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const s of scored) {
    if (s.key in map || used.has(s.col)) continue;
    map[s.key] = s.col; via[s.key] = "header"; used.add(s.col);
  }

  // 2. Values: a date-looking column for date fields, the wordiest column for long text
  const sample = table.rows.slice(0, 50);
  const free = () => table.headers.map((_, i) => i).filter((i) => !used.has(i));
  for (const f of fields) {
    if (f.key in map) continue;
    if (f.kind === "date") {
      const col = free().find((i) => {
        const vals = sample.map((r) => r[i]).filter((v) => !isBlank(v));
        return vals.length > 0 && vals.filter((v) => parseDate(v)).length / vals.length >= 0.8;
      });
      if (col !== undefined) { map[f.key] = col; via[f.key] = "values"; used.add(col); }
    } else if (f.kind === "longtext") {
      const avg = (i: number) => sample.reduce((n, r) => n + cellText(r[i]).length, 0) / Math.max(1, sample.length);
      const col = free().filter((i) => avg(i) >= 15).sort((a, b) => avg(b) - avg(a))[0];
      if (col !== undefined) { map[f.key] = col; via[f.key] = "values"; used.add(col); }
    }
  }

  // 3. AI for whatever is still missing (best effort; never blocks the import)
  const missing = fields.filter((f) => !(f.key in map));
  if (opts.ai && missing.length && free().length) {
    try {
      const cols = free().map((i) => ({ index: i, header: table.headers[i] || `(column ${i + 1})`, samples: sample.slice(0, 3).map((r) => cellText(r[i]).slice(0, 60)) }));
      const res = await claudeChat({
        system: "You map spreadsheet columns to fields. Reply with JSON only.",
        messages: [{
          role: "user",
          content: `Fields needed: ${missing.map((f) => `${f.key} (${f.synonyms.slice(0, 3).join(" / ")})`).join("; ")}.\n` +
            `Columns: ${JSON.stringify(cols)}\n` +
            `Return {"fieldKey": columnIndex} only for confident matches; omit the rest.`,
        }],
        maxTokens: 200,
      });
      const json = JSON.parse(res.content.slice(res.content.indexOf("{"), res.content.lastIndexOf("}") + 1)) as Record<string, unknown>;
      for (const f of missing) {
        const col = json[f.key];
        if (typeof col === "number" && Number.isInteger(col) && col >= 0 && col < table.headers.length && !used.has(col)) {
          map[f.key] = col; via[f.key] = "ai"; used.add(col);
        }
      }
    } catch { /* heuristics are enough */ }
  }
  return { map, via };
}

/** Best match of free text against known names (site codes, Arabic/English names). */
export function matchName<T>(raw: string, items: T[], names: (t: T) => (string | null | undefined)[]): T | null {
  const v = norm(raw);
  if (!v) return null;
  let best: T | null = null, bestLen = 0;
  for (const it of items) {
    for (const n of names(it)) {
      const k = norm(n);
      if (!k) continue;
      if (k === v) return it;
      if (k.length >= 3 && (v.includes(k) || k.includes(v)) && k.length > bestLen) { best = it; bestLen = k.length; }
    }
  }
  return best;
}
