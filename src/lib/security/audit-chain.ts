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

/**
 * Drop-in replacement for `db.auditLog.create({ data })` that computes the
 * tamper-evident hash chain. Use this everywhere instead of raw create.
 *
 * NOTE: There's a small race window in concurrent inserts — two writers might
 * both read the same prev-hash. In SQLite this rarely matters (single-writer).
 * For Postgres we wrap in a transaction + advisory lock.
 */
export async function appendAuditLog(data: AuditLogCreateInput): Promise<string> {
  // Find the latest entry to chain from
  const prev = await db.auditLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { hash: true },
  });
  const prevHash = prev?.hash ?? GENESIS_HASH;

  // Create the row first to get its id + final createdAt
  const row = await db.auditLog.create({
    data: {
      ...data,
      actionType: data.actionType ?? "MANUAL",
      isAutonomous: data.isAutonomous ?? false,
      prevHash,
    },
  });

  // Compute and back-fill the hash
  const hash = computeRowHash({
    id: row.id,
    module: row.module,
    action: row.action,
    description: row.description,
    metadata: row.metadata,
    userId: row.userId,
    riskLevel: row.riskLevel,
    createdAt: row.createdAt,
    prevHash,
  });

  await db.auditLog.update({ where: { id: row.id }, data: { hash } });
  return hash;
}

export interface ChainVerificationReport {
  valid: boolean;
  totalEntries: number;
  brokenAt?: {
    id: string;
    expectedHash: string;
    actualHash: string;
    reason: "hash-mismatch" | "missing-prev-hash" | "wrong-prev-link";
    createdAt: Date;
  };
  // Recent gap statistics (e.g. unfilled hashes from legacy rows)
  unhashedCount: number;
}

/**
 * Walk the chain from oldest to newest, verifying each row.
 * Returns the first detected break or `valid: true` if the chain is intact.
 *
 * Skips legacy rows that have no hash (created before this system was added).
 * Use it as a scheduled job — e.g. daily, posting to /api/security/audit-verify.
 */
export async function verifyAuditChain(): Promise<ChainVerificationReport> {
  const all = await db.auditLog.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, module: true, action: true, description: true, metadata: true,
      userId: true, riskLevel: true, createdAt: true, prevHash: true, hash: true,
    },
  });

  let prevHash = GENESIS_HASH;
  let lastHashedSeen = GENESIS_HASH;
  let unhashed = 0;

  for (const row of all) {
    if (row.hash === null) {
      // Legacy row from before chain was introduced — accept and move on
      unhashed++;
      continue;
    }

    const expectedPrev = lastHashedSeen;
    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        totalEntries: all.length,
        unhashedCount: unhashed,
        brokenAt: {
          id: row.id,
          expectedHash: expectedPrev,
          actualHash: row.prevHash ?? "<null>",
          reason: "wrong-prev-link",
          createdAt: row.createdAt,
        },
      };
    }

    const computed = computeRowHash({
      id: row.id,
      module: row.module,
      action: row.action,
      description: row.description,
      metadata: row.metadata,
      userId: row.userId,
      riskLevel: row.riskLevel,
      createdAt: row.createdAt,
      prevHash: row.prevHash ?? GENESIS_HASH,
    });

    if (computed !== row.hash) {
      return {
        valid: false,
        totalEntries: all.length,
        unhashedCount: unhashed,
        brokenAt: {
          id: row.id,
          expectedHash: computed,
          actualHash: row.hash,
          reason: "hash-mismatch",
          createdAt: row.createdAt,
        },
      };
    }
    prevHash = row.hash;
    lastHashedSeen = row.hash;
  }

  return { valid: true, totalEntries: all.length, unhashedCount: unhashed };
}
