/**
 * Autonomous pipeline analyzer — P0-hardened.
 *
 * Key changes vs the original:
 *   1. Idempotency: (pipelineId + 20-min window) → if a LeakAlert already
 *      exists with this key, return it instead of cascading again.
 *   2. Transaction: LeakAlert + Incident + IncidentActions + (Emergency) +
 *      Alert + AuditLog all happen in ONE db.$transaction — no orphans.
 *   3. Hallucination gate: if Claude's confidence < AUTO_CASCADE_THRESHOLD
 *      (default 0.85), we DO NOT cascade. We create an AISuggestion that an
 *      HSSE Manager must approve before any side-effects fire. WhatsApp is
 *      held back until then.
 *   4. WhatsApp gating: only fires after the cascade completes successfully.
 */
import crypto from "crypto";
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import { log } from "@/lib/observability/logger";

const SYSTEM_USER_EMAIL = "system@aegis.local";
const AUTO_CASCADE_THRESHOLD = 0.85;
const COOLDOWN_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

async function ensureSystemUser(): Promise<string> {
  const u = await db.user.upsert({
    where: { email: SYSTEM_USER_EMAIL },
    update: {},
    create: {
      email: SYSTEM_USER_EMAIL,
      passwordHash: "!system!",
      name: "AEGIS Autonomous System",
      role: "ADMIN",
      isActive: false,
    },
  });
  return u.id;
}

/** Stable hash of (pipelineId + window) — same pipeline in same 20-min window = same key. */
function makeIdempotencyKey(pipelineId: string, now = Date.now()): string {
  const window = Math.floor(now / COOLDOWN_WINDOW_MS);
  return crypto
    .createHash("sha256")
    .update(`pipeline:${pipelineId}:window:${window}`)
    .digest("hex")
    .slice(0, 32);
}

export interface AutonomousAnalysisResult {
  pipelineId: string;
  blocked?: string;
  idempotentHit?: boolean;            // returned existing alert
  belowThreshold?: boolean;           // landed as AISuggestion, not cascaded
  leakDetected: boolean;
  severity?: string;
  confidence?: number;
  leakAlertId?: string;
  incidentId?: string;
  emergencyId?: string;
  suggestionId?: string;
  durationMs: number;
}

export interface AnalyzeOptions {
  /** Bypass the autonomy kill switch — used by manual demo triggers. */
  manualTrigger?: boolean;
  triggeredByUserId?: string;
  /** Override the confidence threshold (manual triggers may want 0.0). */
  autoCascadeThreshold?: number;
}

export async function analyzeAutonomously(
  pipelineId: string,
  opts: AnalyzeOptions = {},
): Promise<AutonomousAnalysisResult> {
  const started = Date.now();
  const threshold = opts.autoCascadeThreshold ?? AUTO_CASCADE_THRESHOLD;
  const idempotencyKey = makeIdempotencyKey(pipelineId, started);

  // ─── 1. Idempotency short-circuit ───
  const existingAlert = await db.leakAlert.findUnique({
    where: { idempotencyKey },
    select: { id: true, severity: true, confidence: true },
  });
  if (existingAlert) {
    return {
      pipelineId,
      idempotentHit: true,
      leakDetected: true,
      severity: existingAlert.severity,
      confidence: existingAlert.confidence,
      leakAlertId: existingAlert.id,
      durationMs: Date.now() - started,
    };
  }

  // ─── 2. Load pipeline + recent readings ───
  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      pressurePoints: {
        orderBy: { positionKm: "asc" },
        include: {
          readings: {
            where: { recordedAt: { gte: new Date(Date.now() - 2 * 3600 * 1000) } },
            orderBy: { recordedAt: "asc" },
          },
        },
      },
    },
  });
  if (!pipeline) {
    return { pipelineId, leakDetected: false, durationMs: Date.now() - started };
  }

  const dataSummary = pipeline.pressurePoints.map((point) => {
    const r = point.readings;
    if (r.length === 0) return { code: point.code, status: "NO_DATA" };
    const first = r[0]; const last = r[r.length - 1];
    return {
      code: point.code,
      positionKm: point.positionKm,
      latitude: point.latitude,
      longitude: point.longitude,
      readingsCount: r.length,
      firstPressure: first.pressure.toFixed(2),
      lastPressure: last.pressure.toFixed(2),
      pressureDropBar: (first.pressure - last.pressure).toFixed(2),
      outOfRange: last.pressure < pipeline.pressureMin || last.pressure > pipeline.pressureMax,
    };
  });

  // ─── 3. Claude analysis ───
  const systemPrompt = `You are AEGIS's autonomous pipeline integrity analyst at OQ.
Calibrate confidence honestly. If signals are ambiguous, return confidence < 0.7.
Respond ONLY in valid JSON. No markdown.`;

  const userPrompt = `Analyze:
PIPELINE: ${pipeline.code} - ${pipeline.name}
Product: ${pipeline.productType}
Safe range: ${pipeline.pressureMin}-${pipeline.pressureMax} bar
DATA (last 2h):
${JSON.stringify(dataSummary, null, 2)}

JSON shape:
{
  "leakDetected": boolean,
  "confidence": 0.0-1.0,
  "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null,
  "estimatedKmFromStart": number|null,
  "estimatedLat": number|null,
  "estimatedLng": number|null,
  "affectedPoints": ["PP-CODE", ...],
  "pressureDrop": number,
  "summary": "1-2 sentences English",
  "summaryAr": "ملخص بالعربية",
  "rootCause": "string",
  "immediateActions": ["...", "...", "..."]
}`;

  const r = await guardedClaudeChat({
    module: "pipeline",
    feature: opts.manualTrigger ? "demo-trigger" : "autonomous-analyze",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.2,
    maxTokens: 1500,
    autonomous: !opts.manualTrigger,
    userId: opts.triggeredByUserId,
    decisionType: "PIPELINE_LEAK_ANALYSIS",
    inputSnapshot: {
      pipelineId, pipelineCode: pipeline.code, summary: dataSummary,
      manualTrigger: opts.manualTrigger ?? false, idempotencyKey,
    },
  });

  if (r.blocked) {
    return { pipelineId, blocked: r.blocked.reason, leakDetected: false, durationMs: Date.now() - started };
  }

  const jsonMatch = r.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    await db.auditLog.create({
      data: {
        module: "PIPELINE", action: "AUTONOMOUS_ANALYZE_PARSE_ERROR",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Claude returned non-JSON for ${pipeline.code}`,
        metadata: JSON.stringify({ pipelineId, raw: r.content.slice(0, 500) }),
        riskLevel: "LOW",
      },
    });
    return { pipelineId, leakDetected: false, durationMs: Date.now() - started };
  }

  const analysis = JSON.parse(jsonMatch[0]);
  const systemUserId = await ensureSystemUser();

  // ─── 4. No leak detected — log & return ───
  if (!analysis.leakDetected) {
    await db.auditLog.create({
      data: {
        module: "PIPELINE", action: "AUTONOMOUS_ANALYZE_CLEAR",
        actionType: "AI_AUTONOMOUS", isAutonomous: true,
        description: `Scan cleared ${pipeline.code}`,
        metadata: JSON.stringify({ pipelineId, confidence: analysis.confidence, idempotencyKey }),
        riskLevel: "LOW", userId: systemUserId,
      },
    });
    return {
      pipelineId, leakDetected: false,
      confidence: analysis.confidence,
      durationMs: Date.now() - started,
    };
  }

  const confidence = Number(analysis.confidence ?? 0);
  const severity = String(analysis.severity ?? "MEDIUM");

  const site = pipeline.startSiteId
    ? await db.site.findUnique({ where: { id: pipeline.startSiteId } })
    : await db.site.findFirst();
  const siteId = site?.id;

  // ─── 5. HALLUCINATION GATE ───
  // Below threshold → create AISuggestion, notify HSSE Manager, DO NOT cascade.
  if (confidence < threshold && !opts.manualTrigger) {
    const suggestion = await db.aISuggestion.create({
      data: {
        type: "PIPELINE_LEAK",
        subjectType: "pipeline",
        subjectId: pipelineId,
        proposedAction: "CREATE_INCIDENT_CASCADE",
        severity,
        confidence,
        reasoning: analysis.summary ?? null,
        reasoningAr: analysis.summaryAr ?? null,
        aiAnalysis: JSON.stringify(analysis),
        metadata: JSON.stringify({
          pipelineCode: pipeline.code,
          idempotencyKey,
          estimatedKmFromStart: analysis.estimatedKmFromStart,
          dataSummary,
        }),
        status: "PENDING",
        siteId,
        decisionId: r.decisionId,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours to review
      },
    });

    // Notify managers — but NO WhatsApp blast yet.
    const managers = await db.user.findMany({
      where: { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] }, isActive: true },
      select: { id: true },
    });
    if (managers.length > 0) {
      await db.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          type: "AI_SUGGESTION",
          severity: severity === "CRITICAL" || severity === "HIGH" ? "WARNING" : "INFO",
          title: `AI suggests review: ${pipeline.code}`,
          titleAr: `اقتراح AI للمراجعة: ${pipeline.code}`,
          body: `Confidence ${(confidence * 100).toFixed(0)}% — below auto-action threshold. ${analysis.summary ?? ""}`,
          bodyAr: analysis.summaryAr ?? null,
          link: `/intelligence/suggestions/${suggestion.id}`,
          metadata: JSON.stringify({ suggestionId: suggestion.id, pipelineId }),
        })),
      });
    }

    await db.auditLog.create({
      data: {
        module: "PIPELINE",
        action: "AUTONOMOUS_BELOW_THRESHOLD",
        actionType: "AI_AUTONOMOUS",
        isAutonomous: true,
        description: `AI suggestion created (${(confidence * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%) — awaiting human review`,
        metadata: JSON.stringify({ suggestionId: suggestion.id, pipelineId, confidence, threshold }),
        riskLevel: severity,
        siteId,
        userId: systemUserId,
      },
    });

    log.info("Pipeline analysis below threshold — suggestion created", {
      pipelineId, confidence, threshold, suggestionId: suggestion.id,
    });

    return {
      pipelineId,
      belowThreshold: true,
      leakDetected: true,
      severity,
      confidence,
      suggestionId: suggestion.id,
      durationMs: Date.now() - started,
    };
  }

  // ─── 6. Above threshold OR manual trigger — TRANSACTIONAL CASCADE ───
  const cascadeResult = await db.$transaction(async (tx) => {
    const alertCount = await tx.leakAlert.count();
    const alertNumber = `LEAK-${new Date().getFullYear()}-${String(alertCount + 1).padStart(4, "0")}`;

    const leakAlert = await tx.leakAlert.create({
      data: {
        alertNumber,
        idempotencyKey, // unique → if duplicate, txn aborts (idempotent retry safety)
        pipelineId: pipeline.id,
        severity,
        estimatedKmFromStart: analysis.estimatedKmFromStart ?? 0,
        estimatedLat: analysis.estimatedLat ?? null,
        estimatedLng: analysis.estimatedLng ?? null,
        confidence,
        pressureDrop: analysis.pressureDrop ?? 0,
        affectedPoints: JSON.stringify(analysis.affectedPoints ?? []),
        aiAnalysis: JSON.stringify(analysis),
        aiSummary: analysis.summary ?? "Autonomous leak detection",
        status: "ACTIVE",
      },
    });

    let incidentId: string | undefined;
    let emergencyId: string | undefined;

    if (siteId) {
      const incidentCount = await tx.incident.count();
      const incidentNumber = `INC-${new Date().getFullYear()}-${String(incidentCount + 1).padStart(4, "0")}`;
      const incident = await tx.incident.create({
        data: {
          incidentNumber,
          idempotencyKey: `inc-${idempotencyKey}`, // sibling key
          title: `[AUTO] Pipeline Leak — ${pipeline.code} at km ${analysis.estimatedKmFromStart}`,
          description: `AEGIS autonomously detected a pipeline leak (confidence ${(confidence * 100).toFixed(0)}%).\n\n${analysis.summary}\n\nRoot cause: ${analysis.rootCause ?? "Under investigation"}`,
          type: "PIPELINE_LEAK",
          severity,
          status: "REPORTED",
          location: `${pipeline.code} — km ${analysis.estimatedKmFromStart}`,
          occurredAt: new Date(),
          isAutoEscalated: true,
          aiAnalysis: JSON.stringify({ leakAlertId: leakAlert.id, ...analysis }),
          siteId,
          reporterId: systemUserId,
        },
      });
      incidentId = incident.id;

      if (Array.isArray(analysis.immediateActions)) {
        for (const desc of analysis.immediateActions.slice(0, 5)) {
          await tx.incidentAction.create({
            data: {
              incidentId: incident.id,
              description: String(desc),
              status: "PENDING",
              isAutoGenerated: true,
              dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
            },
          });
        }
      }

      if (severity === "CRITICAL") {
        const emg = await tx.emergencyEvent.create({
          data: {
            title: `🚨 [AUTO] CRITICAL leak — ${pipeline.code}`,
            type: "PIPELINE_LEAK",
            severity: "CRITICAL",
            status: "ACTIVE",
            startedAt: new Date(),
            siteId,
            commandedById: systemUserId,
          },
        });
        emergencyId = emg.id;
      }

      if (severity === "HIGH" || severity === "CRITICAL") {
        await tx.alert.create({
          data: {
            title: `Pipeline Leak Alert — ${pipeline.code}`,
            type: "PIPELINE_LEAK",
            message: `${severity} autonomous detection on ${pipeline.code} (km ${analysis.estimatedKmFromStart}). Confidence ${(confidence * 100).toFixed(0)}%.`,
            channels: "IN_APP,WHATSAPP",
            status: "PENDING",
            isAutonomous: true,
            siteId,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        module: "PIPELINE",
        action: "AUTONOMOUS_LEAK_DETECTED",
        actionType: "AI_AUTONOMOUS",
        isAutonomous: true,
        description: `${severity} leak on ${pipeline.code} → ${alertNumber}${incidentId ? ` + incident` : ""}${emergencyId ? ` + emergency` : ""}`,
        metadata: JSON.stringify({
          pipelineCode: pipeline.code,
          alertNumber,
          severity,
          confidence,
          idempotencyKey,
          decisionId: r.decisionId,
          manualTrigger: opts.manualTrigger ?? false,
        }),
        riskLevel: severity,
        siteId,
        userId: systemUserId,
      },
    });

    return { leakAlert, incidentId, emergencyId };
  }).catch((err: unknown) => {
    // Unique-constraint violation on idempotencyKey means another worker beat us.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      log.warn("Idempotency race — another worker won", { pipelineId, idempotencyKey });
      return null;
    }
    throw err;
  });

  if (!cascadeResult) {
    // Idempotency race — return the row the winning worker created.
    const winning = await db.leakAlert.findUnique({ where: { idempotencyKey } });
    return {
      pipelineId,
      idempotentHit: true,
      leakDetected: true,
      severity,
      confidence,
      leakAlertId: winning?.id,
      durationMs: Date.now() - started,
    };
  }

  // ─── 7. WhatsApp — only AFTER successful cascade (above-threshold path) ───
  try {
    const phone = process.env.CALLMEBOT_PHONE;
    const apikey = process.env.CALLMEBOT_APIKEY;
    if (phone && apikey) {
      const msg = `🚨 AEGIS AUTO-DETECTION\n${cascadeResult.leakAlert.alertNumber}\nPipeline ${pipeline.code} · ${severity}\nkm ${analysis.estimatedKmFromStart} · ${(confidence * 100).toFixed(0)}% conf.\n${analysis.summary}`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${apikey}`;
      fetch(url).catch(() => { /* best-effort */ });
    }
  } catch { /* swallow */ }

  return {
    pipelineId,
    leakDetected: true,
    severity,
    confidence,
    leakAlertId: cascadeResult.leakAlert.id,
    incidentId: cascadeResult.incidentId,
    emergencyId: cascadeResult.emergencyId,
    durationMs: Date.now() - started,
  };
}
