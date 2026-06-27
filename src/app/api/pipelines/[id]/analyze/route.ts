import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/pipelines/[id]/analyze
 *
 * Claude analyzes recent pressure readings on a pipeline to detect leaks.
 *
 * 🔗 CROSS-MODULE INTEGRATION:
 * When a leak is detected, this cascades across the system:
 *   - LeakAlert       (Pipeline module)
 *   - Incident        (Safety module)        — MEDIUM, HIGH, CRITICAL
 *   - IncidentActions (auto-generated)        — MEDIUM, HIGH, CRITICAL
 *   - Observation     (Safety module)        — HIGH, CRITICAL
 *   - EmergencyEvent  (Command Center)       — CRITICAL only
 *   - Alert           (Admin)                — HIGH, CRITICAL
 *   - AIDecision      (Intelligence audit)
 *   - AuditLog        (Intelligence audit)
 *   - WhatsApp        (notification)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;

    // ═══════════════════════════════════════════════════
    // STEP 1: Load pipeline + recent readings
    // ═══════════════════════════════════════════════════
    const pipeline = await db.pipeline.findUnique({
      where: { id },
      include: {
        pressurePoints: {
          orderBy: { positionKm: "asc" },
          include: {
            readings: {
              where: {
                recordedAt: { gte: new Date(Date.now() - 2 * 3600 * 1000) },
              },
              orderBy: { recordedAt: "asc" },
            },
          },
        },
      },
    });

    if (!pipeline) return fail("NOT_FOUND", "Pipeline not found", 404);

    // ═══════════════════════════════════════════════════
    // STEP 2: Build data summary for Claude
    // ═══════════════════════════════════════════════════
    const dataSummary = pipeline.pressurePoints.map((point) => {
      const readings = point.readings;
      if (readings.length === 0) {
        return {
          code: point.code,
          positionKm: point.positionKm,
          status: "NO_DATA",
        };
      }

      const first = readings[0];
      const last = readings[readings.length - 1];
      const avgPressure = readings.reduce((s, r) => s + r.pressure, 0) / readings.length;
      const pressureDrop = first.pressure - last.pressure;

      return {
        code: point.code,
        positionKm: point.positionKm,
        latitude: point.latitude,
        longitude: point.longitude,
        readingsCount: readings.length,
        firstReading: {
          pressure: first.pressure.toFixed(2),
          time: first.recordedAt.toISOString(),
        },
        lastReading: {
          pressure: last.pressure.toFixed(2),
          time: last.recordedAt.toISOString(),
        },
        averagePressure: avgPressure.toFixed(2),
        pressureDropBar: pressureDrop.toFixed(2),
        currentStatus: last.status,
        expectedRange: `${pipeline.pressureMin}-${pipeline.pressureMax} bar`,
        outOfRange: last.pressure < pipeline.pressureMin || last.pressure > pipeline.pressureMax,
      };
    });

    // ═══════════════════════════════════════════════════
    // STEP 3: Call Claude
    // ═══════════════════════════════════════════════════
    const systemPrompt = `You are an expert HSSE pipeline integrity analyst at OQ (Oman's national energy company). You analyze pressure readings to detect leaks in oil and gas pipelines.

You understand:
- Normal pressure variations are ±2-3 bar
- Pressure drops >5 bar over <60 minutes indicate possible leaks
- Pressure drops >10 bar indicate HIGH probability leaks
- Leaks typically show drops at consecutive points downstream
- You consider Oman-specific factors (desert conditions, pipeline age, MoEM regulations)

You respond ONLY in valid JSON format. No markdown, no explanations outside the JSON.`;

    const userPrompt = `Analyze this pipeline for leaks:

PIPELINE: ${pipeline.code} - ${pipeline.name}
Product: ${pipeline.productType}
Length: ${pipeline.length} km
Safe pressure range: ${pipeline.pressureMin}-${pipeline.pressureMax} bar
Installed: ${pipeline.installedAt.toISOString().split("T")[0]}
Last inspection: ${pipeline.lastInspection?.toISOString().split("T")[0] || "Unknown"}

PRESSURE POINTS DATA (last 2 hours):
${JSON.stringify(dataSummary, null, 2)}

Respond with this exact JSON structure:
{
  "leakDetected": true | false,
  "confidence": 0.0 to 1.0,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null,
  "estimatedKmFromStart": number | null,
  "estimatedLat": number | null,
  "estimatedLng": number | null,
  "affectedPoints": ["PP-CODE", ...],
  "pressureDrop": number,
  "summary": "Brief 1-2 sentence summary in English",
  "summaryAr": "ملخص بالعربية في جملة أو جملتين",
  "rootCause": "Most probable cause",
  "predictions": ["Prediction 1", "Prediction 2", "Prediction 3"],
  "immediateActions": ["Action 1", "Action 2", "Action 3"],
  "preventiveActions": ["Preventive action 1", "Preventive action 2"]
}

If no leak detected, set leakDetected: false, severity: null, and explain in summary.`;

    console.log(`[Pipeline Analysis] Analyzing ${pipeline.code}...`);
    const startTime = Date.now();

    const response = await claudeChat({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.3,
      maxTokens: 1500,
    });

    const duration = Date.now() - startTime;
    console.log(`[Pipeline Analysis] Claude responded in ${duration}ms`);

    // Parse Claude's JSON response
    const text = response.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude did not return valid JSON");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // ═══════════════════════════════════════════════════
    // STEP 4: Log AIDecision (best-effort)
    // ═══════════════════════════════════════════════════
    try {
      await db.aIDecision.create({
        data: {
          type: "PIPELINE_LEAK_ANALYSIS",
          provider: "CLAUDE",
          modelUsed: response.model || "claude-sonnet-4-5",
          inputData: JSON.stringify({ pipelineId: pipeline.id, dataSummary }),
          outputData: JSON.stringify(analysis),
          reasoning: analysis.summary || "Pipeline pressure analysis",
          confidence: analysis.confidence ?? null,
          durationMs: duration,
          autonomous: true,
          requiresHuman: analysis.severity === "CRITICAL" || analysis.severity === "HIGH",
        },
      });
    } catch (err) {
      console.error("[Pipeline Analysis] AIDecision log failed:", err);
    }

    // ═══════════════════════════════════════════════════
    // STEP 5: If no leak — return early
    // ═══════════════════════════════════════════════════
    if (!analysis.leakDetected) {
      // Audit log even for no-leak analysis
      try {
        await db.auditLog.create({
          data: {
            module: "PIPELINE",
            action: "PIPELINE_ANALYZED_NO_LEAK",
            actionType: "AI_AUTONOMOUS",
            isAutonomous: true,
            description: `AI analyzed ${pipeline.code} — no leak detected`,
            metadata: JSON.stringify({
              pipelineCode: pipeline.code,
              pipelineId: pipeline.id,
              confidence: analysis.confidence,
            }),
            userId: session.user.id ?? null,
          },
        });
      } catch (err) {
        console.error("[Pipeline Analysis] AuditLog failed:", err);
      }

      return ok({
        analysis,
        leakAlert: null,
        linked: null,
        pipeline: {
          id: pipeline.id,
          code: pipeline.code,
          name: pipeline.name,
        },
        meta: { durationMs: duration, provider: "CLAUDE", model: response.model },
      });
    }

    // ═══════════════════════════════════════════════════
    // STEP 6: LEAK DETECTED — Create LeakAlert
    // ═══════════════════════════════════════════════════
    const severity = analysis.severity || "MEDIUM";
    const alertCount = await db.leakAlert.count();
    const alertNumber = `LEAK-${new Date().getFullYear()}-${String(alertCount + 1).padStart(4, "0")}`;

    const leakAlert = await db.leakAlert.create({
      data: {
        alertNumber,
        pipelineId: pipeline.id,
        severity,
        estimatedKmFromStart: analysis.estimatedKmFromStart || 0,
        estimatedLat: analysis.estimatedLat || null,
        estimatedLng: analysis.estimatedLng || null,
        confidence: analysis.confidence || 0,
        pressureDrop: analysis.pressureDrop || 0,
        affectedPoints: JSON.stringify(analysis.affectedPoints || []),
        aiAnalysis: JSON.stringify(analysis),
        aiSummary: analysis.summary || "Leak detected by AEGIS AI",
        status: "ACTIVE",
      },
    });

    console.log(`[Pipeline Analysis] ✅ LEAK ALERT created: ${alertNumber}`);

    // ═══════════════════════════════════════════════════
    // STEP 7: 🔗 CROSS-MODULE CASCADE
    //
    // Smart routing based on severity:
    //   MEDIUM   → Incident + Actions
    //   HIGH     → Incident + Actions + Observation + Alert
    //   CRITICAL → Incident + Actions + Observation + Alert + Emergency
    // ═══════════════════════════════════════════════════
    const linked: {
      incident?: any;
      observation?: any;
      emergency?: any;
      alert?: any;
      actionsCount?: number;
    } = {};

    // Resolve siteId (pipeline → startSite, or first available)
    const site = pipeline.startSiteId
      ? await db.site.findUnique({ where: { id: pipeline.startSiteId } })
      : await db.site.findFirst();

    const siteId = site?.id;

    if (!siteId) {
      console.warn("[Pipeline Analysis] ⚠️  No site available — skipping cross-module cascade");
    } else {
      // ───────────────────────────────────────
      // 1️⃣ INCIDENT (always for MEDIUM+)
      // ───────────────────────────────────────
      try {
        const incidentCount = await db.incident.count();
        const incidentNumber = `INC-${new Date().getFullYear()}-${String(incidentCount + 1).padStart(4, "0")}`;

        linked.incident = await db.incident.create({
          data: {
            incidentNumber,
            title: `Pipeline Leak — ${pipeline.code} at km ${analysis.estimatedKmFromStart}`,
            description: `AI-detected pipeline leak with ${(analysis.confidence * 100).toFixed(0)}% confidence.\n\n${analysis.summary}\n\nRoot Cause: ${analysis.rootCause || "Under investigation"}`,
            type: "PIPELINE_LEAK",
            severity,
            status: "REPORTED",
            location: `${pipeline.code} — km ${analysis.estimatedKmFromStart}`,
            occurredAt: new Date(),
            isAutoEscalated: true,
            aiAnalysis: JSON.stringify({
              leakAlertId: leakAlert.id,
              pipelineId: pipeline.id,
              confidence: analysis.confidence,
              predictions: analysis.predictions,
              immediateActions: analysis.immediateActions,
            }),
            siteId,
            reporterId: session.user.id!,
          },
        });
        console.log(`[Pipeline Analysis] ✅ INCIDENT: ${linked.incident.incidentNumber}`);

        // Auto-generate incident actions from AI's immediate actions
        if (analysis.immediateActions && Array.isArray(analysis.immediateActions)) {
          const actions = analysis.immediateActions.slice(0, 5);
          for (const desc of actions) {
            await db.incidentAction.create({
              data: {
                incidentId: linked.incident.id,
                description: desc,
                status: "PENDING",
                isAutoGenerated: true,
                dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2h
              },
            });
          }
          linked.actionsCount = actions.length;
          console.log(`[Pipeline Analysis] ✅ ${actions.length} actions auto-generated`);
        }
      } catch (err) {
        console.error("[Pipeline Analysis] Incident creation failed:", err);
      }

      // ───────────────────────────────────────
      // 2️⃣ OBSERVATION (HIGH + CRITICAL)
      // ───────────────────────────────────────
      if (severity === "HIGH" || severity === "CRITICAL") {
        try {
          const obsCount = await db.observation.count();
          const recordNumber = `OBS-${new Date().getFullYear()}-${String(obsCount + 1).padStart(4, "0")}`;

          linked.observation = await db.observation.create({
            data: {
              recordNumber,
              type: "UNSAFE_CONDITION",
              status: "OPEN",
              location: `${pipeline.code} — km ${analysis.estimatedKmFromStart}`,
              findings: `Pipeline pressure anomaly detected by AEGIS AI.\n\nPressure drop: ${analysis.pressureDrop} bar\nAffected points: ${(analysis.affectedPoints || []).join(", ")}\n\n${analysis.summary}`,
              unsafeDetail: analysis.rootCause || "Under AI investigation",
              observedAt: new Date(),
              siteId,
              reportedById: session.user.id!,
            },
          });
          console.log(`[Pipeline Analysis] ✅ OBSERVATION: ${linked.observation.recordNumber}`);
        } catch (err) {
          console.error("[Pipeline Analysis] Observation creation failed:", err);
        }
      }

      // ───────────────────────────────────────
      // 3️⃣ EMERGENCY EVENT (CRITICAL only)
      // ───────────────────────────────────────
      if (severity === "CRITICAL") {
        try {
          linked.emergency = await db.emergencyEvent.create({
            data: {
              title: `🚨 CRITICAL: Active Pipeline Leak — ${pipeline.code}`,
              type: "PIPELINE_LEAK",
              severity: "CRITICAL",
              status: "ACTIVE",
              evacuationTriggered: false,
              droneDispatched: false,
              startedAt: new Date(),
              siteId,
              commandedById: session.user.id!,
            },
          });
          console.log(`[Pipeline Analysis] 🚨 EMERGENCY ACTIVATED: ${linked.emergency.id}`);
        } catch (err) {
          console.error("[Pipeline Analysis] Emergency creation failed:", err);
        }
      }

      // ───────────────────────────────────────
      // 4️⃣ ALERT (HIGH + CRITICAL)
      // ───────────────────────────────────────
      if (severity === "HIGH" || severity === "CRITICAL") {
        try {
          linked.alert = await (db as any).alert.create({
            data: {
              title: `Pipeline Leak Alert — ${pipeline.code}`,
              type: "PIPELINE_LEAK",
              severity,
              message: `${severity} pipeline leak detected at ${pipeline.code} (km ${analysis.estimatedKmFromStart}). Confidence: ${(analysis.confidence * 100).toFixed(0)}%. ${linked.incident ? `Incident: ${linked.incident.incidentNumber}` : ""}`,
              status: "ACTIVE",
              siteId,
            },
          });
          console.log(`[Pipeline Analysis] ✅ ALERT created`);
        } catch (err) {
          console.error("[Pipeline Analysis] Alert creation failed:", err);
        }
      }

      // Summary log
      const integrated = [
        linked.incident && "Incident",
        linked.observation && "Observation",
        linked.emergency && "Emergency",
        linked.alert && "Alert",
      ].filter(Boolean);
      console.log(`[Pipeline Analysis] 🔗 Integrated modules: ${integrated.join(" → ")}`);
    }

    // ═══════════════════════════════════════════════════
    // STEP 8: WhatsApp notification (best-effort)
    // ═══════════════════════════════════════════════════
    try {
      const phone = process.env.CALLMEBOT_PHONE;
      const apikey = process.env.CALLMEBOT_APIKEY;
      if (phone && apikey) {
        const message = `🚨 AEGIS LEAK ALERT
${alertNumber}
Pipeline: ${pipeline.code}
Severity: ${severity}
Location: km ${analysis.estimatedKmFromStart}
Confidence: ${(analysis.confidence * 100).toFixed(0)}%
${linked.incident ? `Incident: ${linked.incident.incidentNumber}` : ""}
${linked.emergency ? "🚨 EMERGENCY ACTIVATED" : ""}

${analysis.summary}`;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${apikey}`;
        fetch(url).catch(() => { /* best-effort */ });
        console.log(`[Pipeline Analysis] 📱 WhatsApp queued`);
      }
    } catch (err) {
      console.error("[Pipeline Analysis] WhatsApp send failed:", err);
    }

    // ═══════════════════════════════════════════════════
    // STEP 9: Audit log
    // ═══════════════════════════════════════════════════
    try {
      await db.auditLog.create({
        data: {
          module: "PIPELINE",
          action: "LEAK_DETECTED_AI",
          actionType: "AI_AUTONOMOUS",
          isAutonomous: true,
          description: `AI detected ${severity} leak on ${pipeline.code} at km ${analysis.estimatedKmFromStart} (${(analysis.confidence * 100).toFixed(0)}% confidence). Cascaded to: ${[
            "LeakAlert",
            linked.incident && "Incident",
            linked.observation && "Observation",
            linked.emergency && "Emergency",
            linked.alert && "Alert",
          ].filter(Boolean).join(", ")}`,
          metadata: JSON.stringify({
            pipelineCode: pipeline.code,
            pipelineId: pipeline.id,
            leakDetected: true,
            severity,
            confidence: analysis.confidence,
            alertNumber,
            estimatedKm: analysis.estimatedKmFromStart,
            linkedIncident: linked.incident?.incidentNumber,
            linkedObservation: linked.observation?.recordNumber,
            linkedEmergency: linked.emergency?.id,
            linkedAlert: linked.alert?.id,
            actionsAutoGenerated: linked.actionsCount || 0,
          }),
          riskLevel: severity,
          siteId,
          userId: session.user.id ?? null,
        },
      });
    } catch (err) {
      console.error("[Pipeline Analysis] AuditLog failed:", err);
    }

    // ═══════════════════════════════════════════════════
    // STEP 10: Return everything
    // ═══════════════════════════════════════════════════
    return ok({
      analysis,
      leakAlert,
      linked: {
        incident: linked.incident
          ? { id: linked.incident.id, number: linked.incident.incidentNumber }
          : null,
        observation: linked.observation
          ? { id: linked.observation.id, number: linked.observation.recordNumber }
          : null,
        emergency: linked.emergency
          ? { id: linked.emergency.id, title: linked.emergency.title }
          : null,
        alert: linked.alert ? { id: linked.alert.id } : null,
        actionsCount: linked.actionsCount || 0,
      },
      pipeline: {
        id: pipeline.id,
        code: pipeline.code,
        name: pipeline.name,
      },
      meta: {
        durationMs: duration,
        provider: "CLAUDE",
        model: response.model || "claude-sonnet-4-5",
      },
    });
  } catch (error: any) {
    console.error("[Pipeline Analysis] FATAL:", error);
    return fail("INTERNAL_ERROR", error.message || "Analysis failed", 500);
  }
}