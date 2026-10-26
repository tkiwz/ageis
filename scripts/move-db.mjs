#!/usr/bin/env node
/**
 * Copies the AEGIS database (schema + data) to a new Postgres (e.g. Supabase Mumbai)
 * using only what the project already has (Prisma) — no pg_dump needed.
 *
 *   node scripts/move-db.mjs
 *
 * - Old database: DIRECT_URL from .env
 * - New database: asked on screen, input hidden, never saved
 * 1. creates the tables on the new database (prisma db push)
 * 2. copies every table in foreign-key order (rows travel as JSON, so bytes,
 *    dates and arrays round-trip exactly — the audit chain stays valid)
 * 3. checks row counts match, turns on row-level security on every table
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";

function readEnv(key) {
  const line = readFileSync(".env", "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} not found in .env`);
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, "");
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.trim()); });
  });
}

const q = (name) => `"${name.replace(/"/g, '""')}"`;

async function main() {
  const oldUrl = readEnv("DIRECT_URL");
  let newUrl = await askHidden("Paste the NEW project's Session pooler connection string (port 5432, with password): ");
  if (!/^postgres(ql)?:\/\//.test(newUrl)) throw new Error("That does not look like a postgresql:// connection string");
  if (newUrl.includes("ap-northeast-1")) throw new Error("That is still the Tokyo project — use the new one");
  if (!/sslmode=/.test(newUrl)) newUrl += (newUrl.includes("?") ? "&" : "?") + "sslmode=require";

  const src = new PrismaClient({ datasourceUrl: oldUrl });
  const dst = new PrismaClient({ datasourceUrl: newUrl });

  try {
    // ── 1. schema ───────────────────────────────────────────
    console.log("1/4  Creating tables on the new database…");
    const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
      env: { ...process.env, DATABASE_URL: newUrl, DIRECT_URL: newUrl },
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });
    if (push.status !== 0) throw new Error("prisma db push failed");

    // ── 2. order tables by foreign keys ─────────────────────
    const tables = (await src.$queryRawUnsafe(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
    )).map((r) => r.tablename);
    const fks = await src.$queryRawUnsafe(
      `select c.relname as child, p.relname as parent
         from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
        where k.contype = 'f' and k.connamespace = 'public'::regnamespace and k.conrelid <> k.confrelid`,
    );
    const order = [];
    const done = new Set();
    while (order.length < tables.length) {
      const next = tables.filter((t) => !done.has(t) && fks.every((f) => f.child !== t || done.has(f.parent) || !tables.includes(f.parent)));
      if (next.length === 0) throw new Error("Circular foreign keys — cannot order tables");
      next.sort().forEach((t) => { done.add(t); order.push(t); });
    }

    // New database must be empty (no double copy)
    for (const t of order) {
      const [{ n }] = await dst.$queryRawUnsafe(`select count(*)::int as n from ${q(t)}`);
      if (n > 0) throw new Error(`Table ${t} on the new database already has ${n} rows — start from an empty project`);
    }

    // ── 3. copy ─────────────────────────────────────────────
    console.log(`2/4  Copying ${order.length} tables…`);
    const byteaTables = new Set((await src.$queryRawUnsafe(
      `select distinct table_name from information_schema.columns where table_schema = 'public' and data_type = 'bytea'`,
    )).map((r) => r.table_name));
    const withId = new Set((await src.$queryRawUnsafe(
      `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'id'`,
    )).map((r) => r.table_name));

    for (const t of order) {
      const chunk = byteaTables.has(t) ? 5 : 300;
      const orderBy = withId.has(t) ? `order by "id"` : "";
      let copied = 0;
      for (let offset = 0; ; offset += chunk) {
        const [{ rows }] = await src.$queryRawUnsafe(
          `select coalesce(json_agg(x), '[]'::json) as rows from (select * from ${q(t)} ${orderBy} limit ${chunk} offset ${offset}) x`,
        );
        if (!rows.length) break;
        await dst.$executeRawUnsafe(
          `insert into ${q(t)} select * from json_populate_recordset(null::${q(t)}, $1::json)`,
          JSON.stringify(rows),
        );
        copied += rows.length;
        if (rows.length < chunk) break;
      }
      if (copied) console.log(`     ${t}: ${copied}`);
    }

    // ── 4. verify + RLS ─────────────────────────────────────
    console.log("3/4  Checking row counts…");
    for (const t of order) {
      const [{ n: a }] = await src.$queryRawUnsafe(`select count(*)::int as n from ${q(t)}`);
      const [{ n: b }] = await dst.$queryRawUnsafe(`select count(*)::int as n from ${q(t)}`);
      if (a !== b) throw new Error(`Row count differs for ${t}: old ${a}, new ${b}`);
    }

    console.log("4/4  Turning on row-level security…");
    for (const t of order) await dst.$executeRawUnsafe(`alter table public.${q(t)} enable row level security`);

    const [s] = await dst.$queryRawUnsafe(
      `select (select count(*) from "User")::int as users, (select count(*) from "Incident")::int as incidents, (select count(*) from "AuditLog")::int as audit`,
    );
    console.log(`Done. New database has: ${s.users} users, ${s.incidents} incidents, ${s.audit} audit rows`);
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message.replace(/postgres(ql)?:\/\/[^\s"']+/g, "<connection string>"));
  process.exit(1);
});
