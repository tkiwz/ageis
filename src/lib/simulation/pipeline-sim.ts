/**
 * Simulated telemetry for pipelines flagged isSimulated (no live SCADA feed).
 *
 * Deterministic: the same point and time always give the same reading, so the
 * history seeded by scripts/seed-real-oman.ts and the live values written on
 * read line up. Model per pressure point:
 *   pressure = nominal + daily swing (demand peaks in the afternoon) + small noise
 *   flow     = line nominal × daily demand factor
 *   temp     = ground temperature with a daily cycle
 * Nothing here is operator data — the UI labels these lines "simulated".
 */
import { db } from "@/lib/db";

export const SIM_STEP_MS = 15 * 60_000;      // one reading every 15 minutes
const DAY = 24 * 3600_000;

export interface SimPoint {
  code: string;
  nominal: number;      // bar
  expectedMin: number;
  expectedMax: number;
  flowNominal: number;  // m³/h
  seed: number;
}

/** Cheap repeatable noise in [-1, 1]. */
function noise(seed: number, t: number): number {
  const x = Math.sin(seed * 12.9898 + t * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Muscat local time is UTC+4; demand peaks mid-afternoon. */
function dailyPhase(t: number): number {
  const local = ((t + 4 * 3600_000) % DAY) / DAY;      // 0..1 through the local day
  return Math.sin(2 * Math.PI * (local - 0.375));      // peak ≈ 15:00
}

export function simulateReading(p: SimPoint, t: number) {
  const slot = Math.floor(t / SIM_STEP_MS);
  const demand = dailyPhase(t);
  const pressure = p.nominal - 1.6 * demand + 0.35 * noise(p.seed, slot);
  const flow = p.flowNominal * (1 + 0.08 * demand + 0.01 * noise(p.seed + 7, slot));
  const temp = 36 + 6 * dailyPhase(t + 2 * 3600_000) + 0.4 * noise(p.seed + 13, slot);
  const status = pressure < p.expectedMin || pressure > p.expectedMax
    ? "CRITICAL"
    : pressure < p.expectedMin + 1.5 || pressure > p.expectedMax - 1.5 ? "WARNING" : "NORMAL";
  return {
    pressure: Math.round(pressure * 100) / 100,
    flowRate: Math.round(flow),
    temperature: Math.round(temp * 10) / 10,
    status,
  };
}

/** Nominal pressure / flow are kept in the point's code-independent fields. */
export function simPointFromRow(row: {
  code: string; expectedMin: number; expectedMax: number; positionKm: number;
}, line: { length: number; pressureMax: number; flowRate: number | null }, index: number): SimPoint {
  // Nominal sits 60% up the safe band
  const nominal = row.expectedMin + (row.expectedMax - row.expectedMin) * 0.6;
  return {
    code: row.code,
    nominal,
    expectedMin: row.expectedMin,
    expectedMax: row.expectedMax,
    flowNominal: line.flowRate ?? 0,
    seed: index + 1 + row.positionKm / Math.max(line.length, 1),
  };
}

let lastSync = 0;

/**
 * Brings simulated pipelines up to date (called on read, at most once a minute
 * per instance): writes the missing 15-minute readings since each point's last
 * reading (capped) and refreshes its current values.
 */
export async function syncSimulatedPipelines(): Promise<void> {
  const now = Date.now();
  if (now - lastSync < 60_000) return;
  lastSync = now;

  const lines = await db.pipeline.findMany({
    where: { isSimulated: true },
    select: {
      id: true, length: true, pressureMax: true, flowRate: true,
      pressurePoints: {
        orderBy: { positionKm: "asc" },
        select: { id: true, code: true, expectedMin: true, expectedMax: true, positionKm: true, lastReadingAt: true },
      },
    },
  });

  const slotNow = Math.floor(now / SIM_STEP_MS) * SIM_STEP_MS;
  for (const line of lines) {
    for (const [i, pt] of line.pressurePoints.entries()) {
      const sim = simPointFromRow(pt, line, i);
      const last = pt.lastReadingAt ? pt.lastReadingAt.getTime() : slotNow - SIM_STEP_MS;
      if (last >= slotNow) continue;
      const slots: number[] = [];
      for (let t = Math.max(last + SIM_STEP_MS, slotNow - 8 * SIM_STEP_MS); t <= slotNow; t += SIM_STEP_MS) slots.push(t);
      const rows = slots.map((t) => ({ pointId: pt.id, recordedAt: new Date(t), ...simulateReading(sim, t) }));
      const latest = rows[rows.length - 1];
      await db.$transaction([
        db.pressureReading.createMany({ data: rows }),
        db.pressurePoint.update({
          where: { id: pt.id },
          data: {
            currentPressure: latest.pressure, currentFlow: latest.flowRate, currentTemp: latest.temperature,
            status: latest.status, lastReadingAt: latest.recordedAt,
          },
        }),
      ]);
    }
  }
}
