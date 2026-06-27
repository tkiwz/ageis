import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { piGetStats } from "@/lib/devices/pi-client";
import { analyzeVisionDetection } from "@/lib/ai/decision-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WARNING_CLASSES = new Set(["no_helmet", "helemt", "no_vest", "oil_leak", "unsafe"]);
const COOLDOWN_MINUTES = 8;
const MIN_CONFIDENCE = 0.70;

/**
 * Polls the Pi, fetches the latest detection, and runs AI analysis
 * if it's a new warning that isn't in cooldown.
 *
 * Returns: { recorded, analyzed, alertCreated, detection }
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;
  const device = await db.fieldDevice.findUnique({
    where: { id },
    include: { site: true },
  });
  if (!device) return fail("NOT_FOUND", "Device not found", 404);
  if (!device.ipAddress) return fail("NO_IP", "Device has no IP", 400);

  // Get current stats
  let stats;
  try {
    stats = await piGetStats({
      ipAddress: device.ipAddress,
      port: device.port ?? 5000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pi unreachable";
    return fail("PI_UNREACHABLE", message, 503);
  }

  if (!stats.ready || !stats.top_class || stats.top_confidence === undefined) {
    return ok({ recorded: false, analyzed: false, alertCreated: false, reason: "Pi not ready" });
  }

  const label = stats.top_class;
  const confidence = stats.top_confidence;
  const isWarning = WARNING_CLASSES.has(label);

  // Below confidence threshold for warnings — skip
  if (isWarning && confidence < MIN_CONFIDENCE) {
    return ok({ recorded: false, analyzed: false, alertCreated: false, reason: "Below confidence threshold" });
  }

  // Record the detection
  const detection = await db.visionDetection.create({
    data: {
      deviceId: device.id,
      label,
      confidence,
      status: stats.status ?? "INFO",
      allScores: stats.all_scores as never,
    },
  });

  // Increment device counter
  await db.fieldDevice.update({
    where: { id: device.id },
    data: {
      detectionsCount: { increment: 1 },
      lastSeenAt: new Date(),
      status: "ONLINE",
    },
  });

  // Only analyze if it's a warning
  if (!isWarning) {
    return ok({ recorded: true, analyzed: false, alertCreated: false, detection });
  }

  // Check cooldown — any AI analysis on same label in past 8 minutes?
  const cooldownStart = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000);
  const recentAnalyzed = await db.visionDetection.findFirst({
    where: {
      deviceId: device.id,
      label,
      aiAnalyzed: true,
      detectedAt: { gte: cooldownStart },
    },
  });

  if (recentAnalyzed) {
    return ok({
      recorded: true,
      analyzed: false,
      alertCreated: false,
      reason: "In cooldown",
      cooldownUntil: new Date(recentAnalyzed.detectedAt.getTime() + COOLDOWN_MINUTES * 60 * 1000),
      detection,
    });
  }

  // Count same-class detections in past hour for context
  const recentSameDetections = await db.visionDetection.count({
    where: {
      deviceId: device.id,
      label,
      detectedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  // Run AI analysis (Gemini Flash — free)
  let analysis;
  try {
    analysis = await analyzeVisionDetection({
      label,
      confidence,
      status: stats.status ?? "WARNING",
      siteName: device.site?.name ?? "Unknown site",
      siteCode: device.site?.code ?? "N/A",
      deviceName: device.name,
      recentSameDetections,
      language: "en",
    });
  } catch (err) {
    console.error("[ai analysis failed]", err);
    return ok({
      recorded: true,
      analyzed: false,
      alertCreated: false,
      reason: "AI analysis failed",
      error: err instanceof Error ? err.message : String(err),
      detection,
    });
  }

  // Create the Alert
  const alert = await db.alert.create({
    data: {
      type: analysis.severity === "CRITICAL" ? "EMERGENCY"
        : analysis.severity === "HIGH" ? "CRITICAL"
        : analysis.severity === "MEDIUM" ? "WARNING"
        : "INFO",
      title: analysis.alertTitle,
      message: analysis.alertMessage,
      channels: JSON.stringify(["DASHBOARD"]),
      status: "ACTIVE",
      isAutonomous: !analysis.requiresHumanReview,
      siteId: device.siteId ?? null,
    },
  });

  // Update detection with AI results
  await db.visionDetection.update({
    where: { id: detection.id },
    data: {
      aiAnalyzed: true,
      aiSeverity: analysis.severity,
      aiReasoning: analysis.reasoning,
      aiActions: analysis.actions as never,
      alertId: alert.id,
    },
  });

  // Log to AIDecision
  await db.aIDecision.create({
    data: {
      type: "VISION_ANALYSIS",
      provider: analysis.provider,
      modelUsed: analysis.modelUsed,
      inputData: { label, confidence, deviceId: device.id } as never,
      outputData: analysis as never,
      reasoning: analysis.reasoning,
      tokensInput: analysis.tokensInput,
      tokensOutput: analysis.tokensOutput,
      durationMs: analysis.durationMs,
      autonomous: !analysis.requiresHumanReview,
      requiresHuman: analysis.requiresHumanReview,
      visionDetectionId: detection.id,
      alertId: alert.id,
    },
  });

  // Increment device alerts counter
  await db.fieldDevice.update({
    where: { id: device.id },
    data: { alertsCount: { increment: 1 } },
  });

  return ok({
    recorded: true,
    analyzed: true,
    alertCreated: true,
    detection: { ...detection, aiSeverity: analysis.severity },
    alert,
    analysis,
  });
}
