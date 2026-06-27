/**
 * Autonomous Pipeline Monitoring Loop.
 *
 * Cheap pre-filter step (no AI call) → identifies pipelines whose latest
 * pressure readings show anomalies that warrant a Claude analysis.
 *
 * Returns a list of pipeline IDs that should be analyzed.
 * The route layer then triggers the existing analyze endpoint, which already
 * handles the full cross-module cascade.
 */
import { db } from "@/lib/db";
import { checkAutonomyAllowed } from "./settings";

export interface PipelineAnomalyHit {
  pipelineId: string;
  code: string;
  name: string;
  reason: string;
  severity: "MINOR" | "MAJOR";
  worstPressureDrop: number;
  affectedPoints: number;
}

const PRESSURE_DROP_THRESHOLD_BAR = 5; // ≥ 5 bar drop in window = suspicious
const ANOMALY_WINDOW_MINUTES = 15;     // look-back window
const COOLDOWN_MINUTES = 20;           // avoid re-analyzing same pipeline too fast

export interface LoopTickResult {
  ranAt: string;
  blocked?: string;
  scanned: number;
  hits: PipelineAnomalyHit[];
  skippedByCooldown: number;
}

export async function pipelineLoopTick(): Promise<LoopTickResult> {
  const gate = await checkAutonomyAllowed("pipeline");
  if (!gate.allowed) {
    return {
      ranAt: new Date().toISOString(),
      blocked: gate.reason,
      scanned: 0,
      hits: [],
      skippedByCooldown: 0,
    };
  }

  const windowFrom = new Date(Date.now() - ANOMALY_WINDOW_MINUTES * 60_000);
  const cooldownFrom = new Date(Date.now() - COOLDOWN_MINUTES * 60_000);

  // Pipelines that already have an open, recent active leak — skip them.
  const recentlyAnalyzed = await db.leakAlert.findMany({
    where: { createdAt: { gte: cooldownFrom }, status: { in: ["ACTIVE", "INVESTIGATING"] } },
    select: { pipelineId: true },
  });
  const skipIds = new Set(recentlyAnalyzed.map((a) => a.pipelineId));

  // Operational pipelines with their pressure points + window readings.
  const pipelines = await db.pipeline.findMany({
    where: { status: "OPERATIONAL" },
    include: {
      pressurePoints: {
        include: {
          readings: {
            where: { recordedAt: { gte: windowFrom } },
            orderBy: { recordedAt: "asc" },
          },
        },
      },
    },
  });

  let scanned = 0;
  let skippedByCooldown = 0;
  const hits: PipelineAnomalyHit[] = [];

  for (const p of pipelines) {
    scanned++;
    if (skipIds.has(p.id)) {
      skippedByCooldown++;
      continue;
    }

    let worstDrop = 0;
    let affected = 0;
    const reasons: string[] = [];

    for (const point of p.pressurePoints) {
      if (point.readings.length < 2) continue;
      const first = point.readings[0];
      const last = point.readings[point.readings.length - 1];
      const drop = first.pressure - last.pressure;
      const outOfRange =
        last.pressure < p.pressureMin || last.pressure > p.pressureMax;

      // Count each pressure point ONCE even if both conditions fire
      if (drop >= PRESSURE_DROP_THRESHOLD_BAR || outOfRange) {
        affected++;
        worstDrop = Math.max(worstDrop, drop);
      }
      if (drop >= PRESSURE_DROP_THRESHOLD_BAR) {
        reasons.push(`${point.code}: -${drop.toFixed(1)} bar`);
      }
      if (outOfRange) {
        reasons.push(`${point.code} out of safe range (${last.pressure.toFixed(1)} bar)`);
      }
    }

    if (affected > 0) {
      hits.push({
        pipelineId: p.id,
        code: p.code,
        name: p.name,
        reason: reasons.slice(0, 3).join("; "),
        severity: worstDrop >= 10 || affected >= 3 ? "MAJOR" : "MINOR",
        worstPressureDrop: Number(worstDrop.toFixed(2)),
        affectedPoints: affected,
      });
    }
  }

  return {
    ranAt: new Date().toISOString(),
    scanned,
    hits,
    skippedByCooldown,
  };
}
