/**
 * Tamper-evident audit log — each AuditLog row's hash is computed from its
 * own fields PLUS the previous row's hash, forming a chain.
 *
 * If any past row is edited or deleted, the chain breaks at that point and
 * `verifyAuditChain()` will report exactly where the break is.
 *
 * The chain isn't unforgeable on its own (anyone with DB access can rebuild
 * it), but combined with periodic off-site backup of the latest hash, you
 * get a strong tamper-evidence guarantee.
 *
 * Re-anchor: `sealAuditChain()` writes a signed checkpoint holding a digest of
 * every earlier row. Verification then checks old rows against that digest and
 * the chain strictly from the checkpoint onward.
 */
import crypto from "crypto";
import { db } from "@/lib/db";

const HMAC_KEY = () => process.env.AUDIT_CHAIN_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-key";

function computeRowHash(input: {
  id: string;
  module: string;
  action: string;
  description: string;
  metadata?: string | null;
  userId?: string | null;
  riskLevel?: string | null;
  createdAt: Date;
  prevHash: string;
}): string {
  // Canonical string — order matters for reproducibility
  const canon = [
    input.id,
    input.module,
    input.action,
    input.description,
    input.metadata ?? "",
    input.userId ?? "",
    input.riskLevel ?? "",
    input.createdAt.toISOString(),
    input.prevHash,
  ].join("|");
  return crypto.createHmac("sha256", HMAC_KEY()).update(canon).digest("hex");
}

const GENESIS_HASH = "0".repeat(64);
/** pg advisory lock id for audit chain writes. */
const AUDIT_LOCK_KEY = 724001;

export const SEAL_MODULE = "SECURITY";
export const SEAL_ACTION = "AUDIT_CHAIN_SEAL";

interface AuditLogCreateInput {
  module: string;
  action: string;
  actionType?: string;
  isAutonomous?: boolean;
  description: string;
  metadata?: string | null;
  riskLevel?: string | null;
  userId?: string | null;
  siteId?: string | null;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const ROW_FIELDS = {
  id: true, module: true, action: true, description: true, metadata: true,
  userId: true, riskLevel: true, createdAt: true, prevHash: true, hash: true,
} as const;

interface ChainRow {
  id: string;
  module: string;
  action: string;
  description: string;
  metadata: string | null;
  userId: string | null;
  riskLevel: string | null;
  createdAt: Date;
  prevHash: string | null;
  hash: string | null;
}

/**
 * Drop-in replacement for `db.auditLog.create({ data })` that computes the
 * tamper-evident hash chain. Use this everywhere instead of raw create.
 *
 * Serialized with a Postgres advisory lock inside a transaction.
 */
export async function appendAuditLog(data: AuditLogCreateInput): Promise<string> {
  // One writer at a time: a transaction-scoped advisory lock keeps the chain
  // linear under concurrency (works with the pgbouncer transaction pooler).
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    return appendInTx(tx, data);
  });
}

/** Caller must already hold the advisory lock. */
async function appendInTx(tx: Tx, data: AuditLogCreateInput): Promise<string> {
  const prev = await tx.auditLog.findFirst({
    where: { hash: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const prevHash = prev?.hash ?? GENESIS_HASH;

  // Create the row first to get its id + final createdAt
  const row = await tx.auditLog.create({
    data: {
      ...data,
      actionType: data.actionType ?? "MANUAL",
      isAutonomous: data.isAutonomous ?? false,
      prevHash,
    },
  });

  const hash = computeRowHash({ ...row, prevHash });
  await tx.auditLog.update({ where: { id: row.id }, data: { hash } });
  return hash;
}

/**
 * Digest over hashed rows, using each row's hash RECOMPUTED from its content:
 * editing, deleting or inserting any sealed row changes the digest.
 */
function sealDigest(rows: ChainRow[]): { digest: string; count: number } {
  const h = crypto.createHmac("sha256", HMAC_KEY());
  let count = 0;
  for (const r of rows) {
    if (r.hash === null) continue;
    h.update(`${r.id}:${computeRowHash({ ...r, prevHash: r.prevHash ?? GENESIS_HASH })}\n`);
    count++;
  }
  return { digest: h.digest("hex"), count };
}

const isSeal = (r: ChainRow) => r.hash !== null && r.module === SEAL_MODULE && r.action === SEAL_ACTION;

/**
 * Re-anchor the chain: freeze everything written so far under one signed
 * checkpoint. A known break before the seal is recorded in it (not hidden).
 */
export async function sealAuditChain(userId: string, reason: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
      const rows = await tx.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: ROW_FIELDS });
      const before = checkRows(rows);
      const { digest, count } = sealDigest(rows);
      const knownBreak = before.brokenAt
        ? { id: before.brokenAt.id, reason: before.brokenAt.reason, createdAt: before.brokenAt.createdAt }
        : null;

      const hash = await appendInTx(tx, {
        module: SEAL_MODULE,
        action: SEAL_ACTION,
        description: `Audit chain sealed (${count} entries): ${reason}`.slice(0, 500),
        metadata: JSON.stringify({ sealedCount: count, digest, knownBreak, reason }),
        riskLevel: "HIGH",
        userId,
      });
      return { sealedCount: count, hash, knownBreak };
    },
    { timeout: 30_000 },
  );
}

export interface ChainVerificationReport {
  valid: boolean;
  totalEntries: number;
  brokenAt?: {
    id: string;
    expectedHash: string;
    actualHash: string;
    reason: "hash-mismatch" | "missing-prev-hash" | "wrong-prev-link" | "seal-mismatch";
    createdAt: Date;
  };
  // Recent gap statistics (e.g. unfilled hashes from legacy rows)
  unhashedCount: number;
  /** Latest checkpoint, if any — rows before it are checked by digest. */
  sealed?: { id: string; createdAt: Date; sealedCount: number; knownBreak: unknown };
}

/**
 * Walk the chain from oldest to newest, verifying each row.
 * Returns the first detected break or `valid: true` if the chain is intact.
 *
 * Skips legacy rows that have no hash (created before this system was added).
 * Use it as a scheduled job — e.g. daily, posting to /api/security/audit-verify.
 */
export async function verifyAuditChain(): Promise<ChainVerificationReport> {
  const all = await db.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: ROW_FIELDS });

  let sealIdx = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (isSeal(all[i])) { sealIdx = i; break; }
  }
  if (sealIdx < 0) return checkRows(all);

  const seal = all[sealIdx];
  let meta: { sealedCount?: number; digest?: string; knownBreak?: unknown } = {};
  try { meta = JSON.parse(seal.metadata ?? "{}"); } catch { /* reported as seal-mismatch below */ }
  const sealed = { id: seal.id, createdAt: seal.createdAt, sealedCount: meta.sealedCount ?? 0, knownBreak: meta.knownBreak ?? null };
  const sealedUnhashed = all.slice(0, sealIdx).filter((r) => r.hash === null).length;

  const { digest, count } = sealDigest(all.slice(0, sealIdx));
  if (digest !== meta.digest || count !== meta.sealedCount) {
    return {
      valid: false,
      totalEntries: all.length,
      unhashedCount: sealedUnhashed,
      sealed,
      brokenAt: { id: seal.id, expectedHash: meta.digest ?? "<none>", actualHash: digest, reason: "seal-mismatch", createdAt: seal.createdAt },
    };
  }

  // Strict chain from the seal onward (the seal row itself is HMAC-checked too)
  const tail = checkRows(all.slice(sealIdx), seal.prevHash ?? GENESIS_HASH);
  return { ...tail, totalEntries: all.length, unhashedCount: tail.unhashedCount + sealedUnhashed, sealed };
}

function checkRows(rows: ChainRow[], startPrev = GENESIS_HASH): ChainVerificationReport {
  let lastHashedSeen = startPrev;
  let unhashed = 0;

  for (const row of rows) {
    if (row.hash === null) {
      // Legacy row from before chain was introduced — accept and move on
      unhashed++;
      continue;
    }

    if (row.prevHash !== lastHashedSeen) {
      return {
        valid: false,
        totalEntries: rows.length,
        unhashedCount: unhashed,
        brokenAt: {
          id: row.id,
          expectedHash: lastHashedSeen,
          actualHash: row.prevHash ?? "<null>",
          reason: "wrong-prev-link",
          createdAt: row.createdAt,
        },
      };
    }

    const computed = computeRowHash({ ...row, prevHash: row.prevHash ?? GENESIS_HASH });
    if (computed !== row.hash) {
      return {
        valid: false,
        totalEntries: rows.length,
        unhashedCount: unhashed,
        brokenAt: { id: row.id, expectedHash: computed, actualHash: row.hash, reason: "hash-mismatch", createdAt: row.createdAt },
      };
    }
    lastHashedSeen = row.hash;
  }

  return { valid: true, totalEntries: rows.length, unhashedCount: unhashed };
}
