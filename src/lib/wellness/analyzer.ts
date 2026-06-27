/**
 * Worker Wellness Analyzer.
 *
 * Ingests WorkerWellnessReading rows, computes risk band locally, and when
 * thresholds are crossed asks Claude for context-aware reasoning.
 *
 * Key Oman-specific factors:
 *   - Heat stress is the #1 occupational hazard May-September
 *   - H2S exposure cumulative ≥ 100 ppm·min → mandatory rest
 *   - HRV drop > 30% from baseline → fatigue indicator
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";

// Thresholds (calibrated for hot-climate field workers)
const H2S_ACTION_LEVEL_PPM_MIN = 100;   // OSHA-style cumulative dose
const H2S_DANGER_LEVEL_PPM_MIN = 250;
const CO_DANGER_LEVEL_PPM_MIN = 350;
const O2_MIN_PCT = 19.5;
const HR_HIGH_BPM = 150;
const HR_CRITICAL_BPM = 175;
const BODY_TEMP_HIGH_C = 38.0;
const BODY_TEMP_CRITICAL_C = 39.5;
const AMBIENT_HEAT_INDEX_HIGH = 45;     // °C
const AMBIENT_HEAT_INDEX_CRITICAL = 50;

export interface WellnessReadingInput {
  userId: string;
  deviceId?: string;
  heartRate?: number;
  hrVariability?: number;
  bodyTemperature?: number;
  ambientTemp?: number;
  humidity?: number;
  h2sPpm?: number;          // instantaneous ppm — accumulated below
  coPpm?: number;
  o2Level?: number;
  stepsCount?: number;
  fallDetected?: boolean;
  intervalSeconds?: number; // duration this reading covers (for cumulative dose)
}

export interface WellnessOutcome {
  readingId: string;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  triggers: string[];
  alertCreated?: { id: string; type: string; severity: string };
}

/**
 * Compute new cumulative H2S/CO exposure based on the most recent reading
 * in the last 8h (rolling work-shift) plus the new instantaneous ppm.
 */
async function rollupCumulativeExposure(
  userId: string,
  h2sPpm: number,
  coPpm: number,
  intervalSeconds: number,
): Promise<{ h2sExposurePpmMin: number; coExposurePpmMin: number }> {
  const since = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const last = await db.workerWellnessReading.findFirst({
    where: { userId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
  });
  const baseH2s = last?.h2sExposurePpmMin ?? 0;
  const baseCo = last?.coExposurePpmMin ?? 0;
  const minutes = intervalSeconds / 60;
  return {
    h2sExposurePpmMin: Number((baseH2s + h2sPpm * minutes).toFixed(2)),
    coExposurePpmMin: Number((baseCo + coPpm * minutes).toFixed(2)),
  };
}

function classify(opts: {
  hr?: number;
  bodyTemp?: number;
  ambient?: number;
  humidity?: number;
  h2sCum: number;
  coCum: number;
  o2?: number;
  fall?: boolean;
}): { level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; triggers: string[] } {
  const triggers: string[] = [];
  let level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  const bump = (to: "MEDIUM" | "HIGH" | "CRITICAL") => {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    if (order[to] > order[level]) level = to;
  };

  if (opts.fall) { triggers.push("Fall detected"); bump("CRITICAL"); }

  if (opts.h2sCum >= H2S_DANGER_LEVEL_PPM_MIN) {
    triggers.push(`H2S cumulative ${opts.h2sCum.toFixed(0)} ppm·min ≥ danger`);
    bump("CRITICAL");
  } else if (opts.h2sCum >= H2S_ACTION_LEVEL_PPM_MIN) {
    triggers.push(`H2S cumulative ${opts.h2sCum.toFixed(0)} ppm·min ≥ action level`);
    bump("HIGH");
  }
  if (opts.coCum >= CO_DANGER_LEVEL_PPM_MIN) {
    triggers.push(`CO cumulative ${opts.coCum.toFixed(0)} ppm·min`);
    bump("CRITICAL");
  }
  if (opts.o2 !== undefined && opts.o2 < O2_MIN_PCT) {
    triggers.push(`O2 ${opts.o2.toFixed(1)}% below safe threshold`);
    bump("CRITICAL");
  }

  if (opts.hr !== undefined) {
    if (opts.hr >= HR_CRITICAL_BPM) { triggers.push(`HR ${opts.hr} bpm critical`); bump("CRITICAL"); }
    else if (opts.hr >= HR_HIGH_BPM) { triggers.push(`HR ${opts.hr} bpm high`); bump("HIGH"); }
  }

  if (opts.bodyTemp !== undefined) {
    if (opts.bodyTemp >= BODY_TEMP_CRITICAL_C) { triggers.push(`Body temp ${opts.bodyTemp.toFixed(1)}°C critical`); bump("CRITICAL"); }
    else if (opts.bodyTemp >= BODY_TEMP_HIGH_C) { triggers.push(`Body temp ${opts.bodyTemp.toFixed(1)}°C elevated`); bump("HIGH"); }
  }

  if (opts.ambient !== undefined) {
    // Rough heat-index proxy: ambient + 0.1 × humidity bump
    const heatIndex = opts.humidity ? opts.ambient + opts.humidity * 0.1 : opts.ambient;
    if (heatIndex >= AMBIENT_HEAT_INDEX_CRITICAL) { triggers.push(`Heat index ${heatIndex.toFixed(0)}°C critical`); bump("CRITICAL"); }
    else if (heatIndex >= AMBIENT_HEAT_INDEX_HIGH) { triggers.push(`Heat index ${heatIndex.toFixed(0)}°C high`); bump("HIGH"); }
  }

  return { level, triggers };
}

function pickAlertType(triggers: string[]): string {
  if (triggers.some((t) => t.startsWith("Fall"))) return "FALL";
  if (triggers.some((t) => t.startsWith("H2S"))) return "H2S_EXPOSURE";
  if (triggers.some((t) => t.startsWith("CO "))) return "CO_EXPOSURE";
  if (triggers.some((t) => t.startsWith("Heat") || t.startsWith("Body"))) return "HEAT_STRESS";
  if (triggers.some((t) => t.startsWith("HR"))) return "ELEVATED_HR";
  if (triggers.some((t) => t.startsWith("O2"))) return "ASPHYXIATION";
  return "FATIGUE";
}

export async function ingestWellnessReading(input: WellnessReadingInput): Promise<WellnessOutcome> {
  const interval = input.intervalSeconds ?? 60;
  const exposure = await rollupCumulativeExposure(
    input.userId,
    input.h2sPpm ?? 0,
    input.coPpm ?? 0,
    interval,
  );

  const classification = classify({
    hr: input.heartRate,
    bodyTemp: input.bodyTemperature,
    ambient: input.ambientTemp,
    humidity: input.humidity,
    h2sCum: exposure.h2sExposurePpmMin,
    coCum: exposure.coExposurePpmMin,
    o2: input.o2Level,
    fall: input.fallDetected,
  });

  const reading = await db.workerWellnessReading.create({
    data: {
      userId: input.userId,
      deviceId: input.deviceId,
      heartRate: input.heartRate,
      hrVariability: input.hrVariability,
      bodyTemperature: input.bodyTemperature,
      ambientTemp: input.ambientTemp,
      humidity: input.humidity,
      h2sExposurePpmMin: exposure.h2sExposurePpmMin,
      coExposurePpmMin: exposure.coExposurePpmMin,
      o2Level: input.o2Level,
      stepsCount: input.stepsCount ?? 0,
      fallDetected: input.fallDetected ?? false,
      wellnessLevel: classification.level,
    },
  });

  // No alert needed below MEDIUM
  if (classification.level === "LOW") {
    return { readingId: reading.id, level: classification.level, triggers: classification.triggers };
  }

  // Avoid alert spam: don't create new alert if there's an unacknowledged one of same type in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const alertType = pickAlertType(classification.triggers);
  const recentSame = await db.workerWellnessAlert.findFirst({
    where: {
      userId: input.userId,
      alertType,
      acknowledged: false,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentSame) {
    return { readingId: reading.id, level: classification.level, triggers: classification.triggers };
  }

  // Look up worker for naming
  const worker = await db.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } });
  const workerName = worker?.name ?? "Worker";

  // Ask Claude for reasoning (only for HIGH/CRITICAL — keep MEDIUM cheap)
  let aiReasoning: string | null = null;
  let recommendedAction: string | null = null;
  if (classification.level === "HIGH" || classification.level === "CRITICAL") {
    const r = await guardedClaudeChat({
      module: "forecast", // forecast module = general AI reasoning (not tied to vision toggle)
      feature: "wellness-reasoning",
      system: `You are AEGIS's worker wellness analyst. Given physiological + environmental data, explain the risk and recommend a concrete action.
Respond ONLY in JSON: {"reasoning": "short English explanation, 1-2 sentences", "action": "concrete recommended action"}.`,
      messages: [{
        role: "user",
        content: `Worker: ${workerName}\nTriggers: ${classification.triggers.join("; ")}\nHR=${input.heartRate}bpm body=${input.bodyTemperature}°C ambient=${input.ambientTemp}°C H2S=${exposure.h2sExposurePpmMin}ppm·min CO=${exposure.coExposurePpmMin}ppm·min O2=${input.o2Level}% fall=${input.fallDetected}`,
      }],
      maxTokens: 300,
      temperature: 0.3,
      autonomous: true,
      decisionType: "WELLNESS_ANALYSIS",
    });
    if (!r.blocked) {
      const m = r.content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const j = JSON.parse(m[0]);
          aiReasoning = j.reasoning ?? null;
          recommendedAction = j.action ?? null;
        } catch { /* swallow */ }
      }
    }
  }

  const message = `${workerName}: ${classification.triggers[0] ?? "wellness anomaly"}`;
  const messageAr = `${workerName}: ${classification.triggers[0] ?? "حالة صحية غير طبيعية"}`;

  const alert = await db.workerWellnessAlert.create({
    data: {
      userId: input.userId,
      alertType,
      severity: classification.level,
      message,
      messageAr,
      aiReasoning,
      recommendedAction,
    },
  });

  // In-app notification to HSSE managers + the worker themselves
  const recipients = await db.user.findMany({
    where: { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] }, isActive: true },
    select: { id: true },
  });
  const recipientIds = Array.from(new Set([input.userId, ...recipients.map((r) => r.id)]));
  await db.notification.createMany({
    data: recipientIds.map((uid) => ({
      userId: uid,
      type: "WELLNESS",
      severity: classification.level === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `Wellness alert: ${workerName}`,
      titleAr: `تنبيه صحي: ${workerName}`,
      body: message + (recommendedAction ? ` — ${recommendedAction}` : ""),
      bodyAr: messageAr,
      link: `/safety/wellness/${alert.id}`,
      metadata: JSON.stringify({ alertId: alert.id, alertType, triggers: classification.triggers }),
    })),
  });

  await db.auditLog.create({
    data: {
      module: "SAFETY",
      action: "WELLNESS_ALERT_CREATED",
      actionType: "AI_AUTONOMOUS",
      isAutonomous: true,
      description: `${classification.level} wellness alert for ${workerName}: ${alertType}`,
      metadata: JSON.stringify({ alertId: alert.id, triggers: classification.triggers, exposure }),
      riskLevel: classification.level,
      userId: input.userId,
    },
  });

  return {
    readingId: reading.id,
    level: classification.level,
    triggers: classification.triggers,
    alertCreated: { id: alert.id, type: alertType, severity: classification.level },
  };
}
