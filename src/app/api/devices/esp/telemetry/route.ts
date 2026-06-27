import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GAS_WARNING   = 200;
const GAS_CRITICAL  = 400;
const TEMP_WARNING  = 40;
const TEMP_CRITICAL = 55;

interface ESP32Payload {
  deviceCode:    string;
  temperature?:  number;
  pressure?:     number;
  gasLevel?:     number;
  alertActive?:  boolean;
  voltage?:      number;
  currentMa?:    number;
  acceleration?: number;
}

const AI_SYSTEM = `You are an HSSE safety expert for oil & gas operations in Oman.
An ESP32 safety sensor just detected an abnormal reading.
Respond ONLY with valid JSON:
{
  "rootCause": "likely cause in 1-2 sentences",
  "immediateActions": ["action 1", "action 2", "action 3"],
  "predictions": ["what could happen in 10 min if unaddressed", "what could happen in 1 hour"],
  "riskLevel": "HIGH or CRITICAL",
  "summary": "executive summary in 2 sentences"
}`;

async function runAIAnalysis(
  gas: number, temp: number, pressure: number,
  siteName: string, deviceCode: string
): Promise<Record<string, unknown>> {
  const prompt = `Sensor alert at ${siteName} (${deviceCode}):
- Gas Level: ${gas.toFixed(0)} ppm (CRITICAL threshold: 400 ppm)
- Temperature: ${temp.toFixed(1)} C (CRITICAL threshold: 55 C)
- Pressure: ${pressure.toFixed(1)} hPa
- Time: ${new Date().toISOString()}
Respond ONLY with JSON.`;

  try {
    const result = await claudeChat({
      system: AI_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 800,
      temperature: 0.3,
    });
    const cleaned = result.content.trim()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned);
  } catch {
    return {
      rootCause: "Automated analysis unavailable — manual review required.",
      immediateActions: [
        "Evacuate the affected area immediately",
        "Contact site supervisor",
        "Activate emergency response protocol",
      ],
      predictions: [
        "Gas concentration may increase to hazardous levels",
        "Risk of explosion or personnel injury if unaddressed",
      ],
      riskLevel: "CRITICAL",
      summary: `Critical sensor reading at ${siteName}. Immediate action required.`,
    };
  }
}

export async function POST(req: NextRequest) {
  let body: ESP32Payload;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.deviceCode) return fail("MISSING_FIELDS", "deviceCode required", 400);

  const device = await db.fieldDevice.findFirst({
    where: { code: body.deviceCode },
    include: { site: true },
  });
  if (!device) return fail("NOT_FOUND", `Device ${body.deviceCode} not found`, 404);

  const gas  = body.gasLevel    ?? 0;
  const temp = body.temperature ?? 0;
  const pres = body.pressure    ?? 0;

  // Store telemetry
  await db.deviceTelemetry.create({
    data: {
      deviceId:     device.id,
      temperature:  temp,
      pressure:     pres,
      gasLevel:     gas,
      voltage:      body.voltage      ?? null,
      currentMa:    body.currentMa    ?? null,
      acceleration: body.acceleration ?? null,
      alertActive:  body.alertActive  ?? false,
    },
  });

  // Update device
  await db.fieldDevice.update({
    where: { id: device.id },
    data: {
      status: "ONLINE", lastSeenAt: new Date(),
      detectionsCount: { increment: 1 },
      batteryPercent: body.voltage
        ? Math.max(0, Math.min(100, Math.round(((body.voltage - 3.0) / (4.2 - 3.0)) * 100)))
        : undefined,
    },
  });

  // Determine alert level
  let alertLevel: "NONE" | "WARNING" | "CRITICAL" = "NONE";
  if (gas >= GAS_CRITICAL || temp >= TEMP_CRITICAL) alertLevel = "CRITICAL";
  else if (gas >= GAS_WARNING || temp >= TEMP_WARNING) alertLevel = "WARNING";

  if (alertLevel === "NONE") {
    return ok({ stored: true, alertCreated: false, alertLevel: "NONE", command: "OK" });
  }

  // Create Alert
  const alertTitle = alertLevel === "CRITICAL"
    ? `CRITICAL: ${gas >= GAS_CRITICAL ? `Gas ${gas.toFixed(0)} ppm` : `Temp ${temp.toFixed(1)}C`} — ${device.site?.name ?? device.code}`
    : `WARNING: Sensor reading elevated — ${device.site?.name ?? device.code}`;

  const alert = await db.alert.create({
    data: {
      type: alertLevel, title: alertTitle,
      message: `Gas: ${gas.toFixed(0)} ppm | Temp: ${temp.toFixed(1)}C | Pressure: ${pres.toFixed(0)} hPa | Device: ${device.code}`,
      channels: JSON.stringify(["DASHBOARD"]),
      status: "ACTIVE", isAutonomous: true, siteId: device.siteId ?? null,
    },
  });

  await db.fieldDevice.update({ where: { id: device.id }, data: { alertsCount: { increment: 1 } } });

  // Auto Incident + AI Analysis (CRITICAL only)
  let incidentId: string | null = null;
  let aiSummary = "Manual review required";
  let aiAction  = "Evacuate area, contact supervisor";

  if (alertLevel === "CRITICAL") {
    const systemUser = await db.user.findFirst({ where: { role: { in: ["ADMIN", "HSSE_MANAGER"] } } });

    if (systemUser && device.siteId) {
      const incident = await db.incident.create({
        data: {
          incidentNumber:  `INC-ESP-${Date.now()}`,
          title:           gas >= GAS_CRITICAL
            ? `Auto: Critical Gas Level at ${device.site?.name ?? device.code}`
            : `Auto: Critical Temperature at ${device.site?.name ?? device.code}`,
          description:
            `Automatic incident report generated by AEGIS.\n` +
            `Device: ${device.code} at ${device.site?.name}\n` +
            `Gas: ${gas.toFixed(0)} ppm | Temp: ${temp.toFixed(1)}C | Pressure: ${pres.toFixed(0)} hPa | Voltage: ${(body.voltage ?? 0).toFixed(2)}V\n` +
            `Time: ${new Date().toISOString()}`,
          type:            gas >= GAS_CRITICAL ? "HAZARDOUS_SUBSTANCE" : "ENVIRONMENTAL",
          severity:        "CRITICAL",
          status:          "REPORTED",
          location:        device.site?.name ?? device.code,
          occurredAt:      new Date(),
          isAutoEscalated: true,
          siteId:          device.siteId,
          reporterId:      systemUser.id,
        },
      });
      incidentId = incident.id;

      // Claude AI Analysis
      const analysis = await runAIAnalysis(gas, temp, pres, device.site?.name ?? device.code, device.code);
      aiSummary = String(analysis.summary ?? aiSummary);
      aiAction  = (analysis.immediateActions as string[])?.[0] ?? aiAction;

      await db.incident.update({
        where: { id: incident.id },
        data: { aiAnalysis: JSON.stringify(analysis) },
      });

      await db.aIDecision.create({
        data: {
          type: "INCIDENT_ANALYSIS", provider: "CLAUDE", modelUsed: "claude-sonnet-4-6",
          inputData: { deviceCode: device.code, gas, temp, pres } as never,
          outputData: analysis as never,
          reasoning: aiSummary,
          autonomous: true, requiresHuman: true,
          incidentId: incident.id, alertId: alert.id,
        },
      }).catch(() => {});
    }
  }

  // WhatsApp (CRITICAL only)
  if (alertLevel === "CRITICAL") {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    fetch(`${base}/api/notify/whatsapp`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          `*AEGIS CRITICAL ALERT*\n` +
          `Device: ${device.code}\n` +
          `Site: ${device.site?.name ?? "Unknown"}\n` +
          `Gas: ${gas.toFixed(0)} ppm | Temp: ${temp.toFixed(1)} C\n` +
          `Voltage: ${(body.voltage ?? 0).toFixed(2)} V\n` +
          `\n*AI:* ${aiSummary}\n` +
          `*Action:* ${aiAction}\n` +
          `_AEGIS HSSE Platform - Oman_`,
      }),
    }).catch(() => {});
  }

  return ok({
    stored: true, alertCreated: true, alertLevel,
    command: alertLevel === "CRITICAL" ? "BUZZER_ON" : "OK",
    incidentCreated: !!incidentId, incidentId,
  });
}