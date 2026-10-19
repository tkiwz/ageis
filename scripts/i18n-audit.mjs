#!/usr/bin/env node
/**
 * i18n + design-system audit (ADR-004).
 *
 *   node scripts/i18n-audit.mjs                 # summary for src/app + src/components
 *   node scripts/i18n-audit.mjs path/a.tsx dir/  # only these files / folders
 *   node scripts/i18n-audit.mjs --strict ...     # exit 1 if anything is found
 *   node scripts/i18n-audit.mjs --details ...    # print every finding with line numbers
 *
 * Rules (heuristics, tuned for this codebase):
 *   english    hardcoded English UI text (JSX text, placeholder/title/aria-label/alt/label)
 *   arabic     Arabic text outside the Arabic dictionaries (inline bilingual copy)
 *   rtl-attr   hardcoded dir="rtl" (direction comes from <html dir>)
 *   palette    raw Tailwind palette colours (text-red-400, bg-green-500/10 …) or hex in className
 *   physical   physical direction classes (ml-, pr-, left-, text-right, border-l …)
 *   locale     toLocaleString/DateString/TimeString (use useFormat / formatDate)
 *   legacy     imports of the legacy i18n shims
 *   demo       demo / prototype / coming soon / simulate / mock wording
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const details = args.includes("--details");
const targets = args.filter((a) => !a.startsWith("--"));
const ROOT = process.cwd();
const roots = targets.length ? targets : ["src/app", "src/components"];

const SKIP_DIRS = ["src/app/api", "src/lib/i18n/messages"];
const ARABIC_OK = ["src/lib/navigation.ts", "src/lib/i18n/messages/ar"];

function walk(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    if (SKIP_DIRS.some((d) => relative(ROOT, p).split(sep).join("/").startsWith(d))) return out;
    for (const f of readdirSync(p)) walk(join(p, f), out);
  } else if (/\.(tsx|ts)$/.test(p) && !/\.test\.|\.d\.ts$/.test(p)) out.push(p);
  return out;
}

const ALLOW_WORDS = new Set(["AEGIS", "AI", "ID", "OK", "PDF", "CSV", "API", "URL", "GPS", "PPE", "HSSE", "ESP32", "RPi", "ppm", "km", "bar", "kPa", "dB", "LEL", "AQI", "CO", "CO2", "H2S", "O2", "°C", "mm", "PTW", "SLA", "UTC", "GST", "KPI", "QR", "SOS"]);
const englishText = /[A-Za-z]{2,}(?:[\s,.'’-]+[A-Za-z]{2,})*/;

const RULES = {
  english: (line) => {
    const hits = [];
    // JSX text between > and <, outside {expressions}
    for (const m of line.matchAll(/>\s*([^<>{}]*[A-Za-z]{2,}[^<>{}]*)\s*</g)) {
      const txt = m[1].trim();
      if (!txt || /^[\s\d.,:;%/()+\-–—·•→←|*#°]+$/.test(txt)) continue;
      const words = txt.match(/[A-Za-z][A-Za-z0-9’']*/g) ?? [];
      if (words.length && words.every((w) => ALLOW_WORDS.has(w))) continue;
      if (/^[a-z][\w.]*\(/.test(txt) || /=>|&&|\?\?/.test(txt) || /^[&,|]/.test(txt) || /[A-Z]\w*Props/.test(txt)) continue; // code fragments / TS generics
      hits.push(txt);
    }
    for (const m of line.matchAll(/\b(placeholder|title|aria-label|alt|label)=["']([^"'{}]*[A-Za-z]{2,}[^"'{}]*)["']/g)) {
      if (!ALLOW_WORDS.has(m[2].trim())) hits.push(`${m[1]}="${m[2]}"`);
    }
    for (const m of line.matchAll(/(?:toast(?:\.\w+)?|setError|alert|confirm)\(\s*["`]([^"`]*[A-Za-z]{3,}[^"`]*)["`]/g)) hits.push(m[1]);
    return hits;
  },
  arabic: (line, file) => (ARABIC_OK.some((p) => file.startsWith(p)) ? [] : line.match(/[؀-ۿ][؀-ۿ\s،.]{1,}/g) ?? []),
  "rtl-attr": (line) => line.match(/dir=["']rtl["']/g) ?? [],
  palette: (line) =>
    line.match(/\b(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|divide|outline|decoration)-(?:red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime|yellow|amber|orange|slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d+)?\b/g) ?? [],
  physical: (line) =>
    (line.match(/(?<=["'`\s{(:])-?(?:ml|mr|pl|pr)-(?:\d|\[|px|auto)[\w./\]]*|(?<=["'`\s{(:])(?:left|right)-(?:\d|\[|px|auto|full|1\/2)[\w./\]]*|\btext-(?:left|right)\b|\bborder-[lr](?:-\w+)?\b|\brounded-[lr](?:-\w+)?\b|\brounded-(?:tl|tr|bl|br)(?:-\w+)?\b|\bspace-x-\d/g) ?? []),
  locale: (line) => line.match(/\.toLocale(?:Date|Time)?String\(/g) ?? [],
  legacy: (line) => line.match(/from ["']@\/lib\/(?:lang-context|i18n\/useTranslation|i18n\/translations)["']/g) ?? [],
  demo: (line) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return [];
    return line.match(/\b(?:demo|prototype|coming soon|simulat\w*|mock\w*|lorem)\b/gi) ?? [];
  },
};

const files = roots.flatMap((r) => walk(join(ROOT, r)));
const totals = Object.fromEntries(Object.keys(RULES).map((k) => [k, 0]));
const perFile = [];

for (const abs of files) {
  const file = relative(ROOT, abs).split(sep).join("/");
  const lines = readFileSync(abs, "utf8").split("\n");
  const found = Object.fromEntries(Object.keys(RULES).map((k) => [k, []]));
  lines.forEach((line, i) => {
    if (/i18n-audit-ignore/.test(line)) return;
    for (const [rule, fn] of Object.entries(RULES)) {
      for (const hit of fn(line, file)) found[rule].push(`${i + 1}: ${String(hit).slice(0, 90)}`);
    }
  });
  const count = Object.values(found).reduce((a, b) => a + b.length, 0);
  if (count) {
    perFile.push({ file, count, found });
    for (const k of Object.keys(found)) totals[k] += found[k].length;
  }
}

perFile.sort((a, b) => b.count - a.count);
for (const { file, count, found } of perFile) {
  const parts = Object.entries(found).filter(([, v]) => v.length).map(([k, v]) => `${k}:${v.length}`).join(" ");
  console.log(`${String(count).padStart(4)}  ${file}  (${parts})`);
  if (details) for (const [k, v] of Object.entries(found)) for (const h of v) console.log(`        ${k} ${h}`);
}
const sum = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`\n${files.length} files scanned · ${perFile.length} with findings · ${sum} findings`);
console.log(Object.entries(totals).map(([k, v]) => `${k}=${v}`).join("  "));
if (strict && sum > 0) process.exit(1);
