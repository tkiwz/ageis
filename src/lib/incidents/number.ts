/**
 * Incident numbers: INC-YYYY-NNNN, the highest existing number this year + 1.
 * (Counting rows breaks as soon as one incident is deleted: the next number
 * already exists and the unique index rejects the insert.)
 */
import { db } from "@/lib/db";

type IncidentReader = Pick<typeof db, "incident">;

export async function nextIncidentNumber(client: IncidentReader = db, offset = 0): Promise<string> {
  const year = new Date().getFullYear();
  const last = await client.incident.findFirst({
    where: { incidentNumber: { startsWith: `INC-${year}-` } },
    orderBy: { incidentNumber: "desc" },
    select: { incidentNumber: true },
  });
  const n = last ? parseInt(last.incidentNumber.split("-")[2] ?? "0", 10) || 0 : 0;
  return `INC-${year}-${String(n + 1 + offset).padStart(4, "0")}`;
}

/** True for a unique-constraint violation on the incident number (retry with the next one). */
export function isNumberClash(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes("incidentNumber");
}
