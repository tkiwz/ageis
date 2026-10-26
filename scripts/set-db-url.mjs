#!/usr/bin/env node
/**
 * Points the local .env at the Mumbai database.
 *
 *   node scripts/set-db-url.mjs
 *
 * Asks only for the database password (input hidden), encodes it safely and
 * writes DATABASE_URL (transaction pooler, 6543) + DIRECT_URL (session, 5432).
 * The password is never printed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import readline from "node:readline";

const REF = "axydjgpespvpltcvyujr";
const HOST = "aws-0-ap-south-1.pooler.supabase.com";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const password = (await askHidden("Database password (hidden): ")).trim();
if (!password) { console.error("No password entered — nothing changed."); process.exit(1); }

const pw = encodeURIComponent(password);
const values = {
  DATABASE_URL: `postgresql://postgres.${REF}:${pw}@${HOST}:6543/postgres?pgbouncer=true&connection_limit=5&pool_timeout=20`,
  DIRECT_URL: `postgresql://postgres.${REF}:${pw}@${HOST}:5432/postgres`,
};

let env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
for (const [key, value] of Object.entries(values)) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\n?$/, "\n")}${line}\n`;
}
writeFileSync(".env", env);
console.log("Done: DATABASE_URL and DIRECT_URL in .env now point to the Mumbai database.");
