import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory AuditLog table, enough for the chain code paths
type Row = {
  id: string; module: string; action: string; description: string; metadata: string | null;
  userId: string | null; riskLevel: string | null; createdAt: Date; prevHash: string | null; hash: string | null;
};
const rows: Row[] = [];
let seq = 0;
const sorted = () => [...rows].sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id));

const auditLog = {
  findFirst: async () => [...sorted()].reverse().find((r) => r.hash !== null) ?? null,
  findMany: async () => sorted().map((r) => ({ ...r })),
  create: async ({ data }: { data: Partial<Row> }) => {
    seq++;
    const row: Row = {
      id: `r${String(seq).padStart(4, "0")}`, module: "", action: "", description: "", metadata: null,
      userId: null, riskLevel: null, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)), prevHash: null, hash: null,
      ...data,
    } as Row;
    rows.push(row);
    return { ...row };
  },
  update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
    Object.assign(rows.find((r) => r.id === where.id)!, data);
  },
};
const tx = { auditLog, $executeRaw: async () => 0 };

vi.mock("@/lib/db", () => ({
  db: { auditLog, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) },
}));

const { appendAuditLog, sealAuditChain, verifyAuditChain } = await import("./audit-chain");

const add = (n: number) => Promise.all(Array.from({ length: n }, (_, i) => appendAuditLog({ module: "TEST", action: "A", description: `e${i}` })));

describe("audit chain seal", () => {
  beforeEach(() => { rows.length = 0; seq = 0; });

  it("verifies an intact chain", async () => {
    for (let i = 0; i < 3; i++) await add(1);
    expect((await verifyAuditChain()).valid).toBe(true);
  });

  it("re-anchors past a known break and records it", async () => {
    for (let i = 0; i < 3; i++) await add(1);
    rows[1].prevHash = "0".repeat(64); // the historic wrong link
    expect((await verifyAuditChain()).brokenAt?.reason).toBe("wrong-prev-link");

    const seal = await sealAuditChain("admin", "known break from migration");
    expect(seal.knownBreak?.id).toBe(rows[1].id);

    for (let i = 0; i < 2; i++) await add(1);
    const report = await verifyAuditChain();
    expect(report.valid).toBe(true);
    expect(report.sealed?.sealedCount).toBe(3);
  });

  it("still detects edits to sealed rows", async () => {
    for (let i = 0; i < 3; i++) await add(1);
    await sealAuditChain("admin", "checkpoint");
    rows[0].description = "tampered";
    expect((await verifyAuditChain()).brokenAt?.reason).toBe("seal-mismatch");
  });

  it("still detects deleted sealed rows", async () => {
    for (let i = 0; i < 3; i++) await add(1);
    await sealAuditChain("admin", "checkpoint");
    rows.splice(1, 1);
    expect((await verifyAuditChain()).brokenAt?.reason).toBe("seal-mismatch");
  });

  it("checks the chain strictly after the seal", async () => {
    await add(2);
    await sealAuditChain("admin", "checkpoint");
    await add(1);
    await add(1);
    rows[rows.length - 1].prevHash = "f".repeat(64);
    expect((await verifyAuditChain()).brokenAt?.reason).toBe("wrong-prev-link");
  });
});
