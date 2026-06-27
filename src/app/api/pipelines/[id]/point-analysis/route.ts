/**
 * POST /api/pipelines/[id]/point-analysis
 *
 * Quick Claude analysis of a single pressure point.
 * Called from the 3D scene when the user presses the PS5 touchpad.
 * Lightweight — no cascade, no alerts — just an instant AI assessment.
 *
 * Body: { pointCode: string }
 *
 * Returns: { risk, riskAr, summary, summaryAr, recommendations, status, confidence }
 */

import { NextRequest }         from "next/server";
import { auth }                from "@/auth";
import { ok, fail }            from "@/lib/api-response";
import { db }                  from "@/lib/db";
import { claudeChat }          from "@/lib/ai/claude-client";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id }        = await params;
    const body          = await req.json();
    const { pointCode } = body as { pointCode: string };

    if (!pointCode) return fail("MISSING_FIELDS", "pointCode required", 400);

    // Load pipeline + specific point
    const pipeline = await db.pipeline.findUnique({
      where: { id },
      select: {
        code: true, name: true, productType: true,
        pressureMin: true, pressureMax: true,
        length: true, material: true,
        pressurePoints: {
          where: { code: pointCode },
          take: 1,
          include: {
            readings: {
              orderBy: { recordedAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (!pipeline)                          return fail("NOT_FOUND", "Pipeline not found", 404);
    const point = pipeline.pressurePoints[0];
    if (!point)                             return fail("NOT_FOUND", "Pressure point not found", 404);

    // Build context for Claude
    const pressure = point.currentPressure;
    const pct      = pressure !== null && pipeline.pressureMax > pipeline.pressureMin
      ? ((pressure - pipeline.pressureMin) / (pipeline.pressureMax - pipeline.pressureMin)) * 100
      : null;

    const recentReadings = point.readings.map((r) => ({
      pressure: r.pressure.toFixed(2),
      flow:     r.flowRate?.toFixed(1) ?? "—",
      temp:     r.temperature?.toFixed(1) ?? "—",
      status:   r.status,
      time:     r.recordedAt.toISOString(),
    }));

    const systemPrompt = `You are an expert pipeline integrity engineer at OQ (Oman's national energy company).
Analyze a single pressure-monitoring point and give a brief but professional safety assessment.
Respond ONLY in valid JSON — no markdown, no extra text.`;

    const userPrompt = `PIPELINE: ${pipeline.code} — ${pipeline.name}
Product: ${pipeline.productType}
Safe pressure range: ${pipeline.pressureMin}–${pipeline.pressureMax} bar
Material: ${pipeline.material}

PRESSURE POINT: ${point.code}
Position: km ${point.positionKm} of ${pipeline.length} km
Coordinates: ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}
Current pressure: ${pressure !== null ? pressure + " bar" : "NO DATA"} ${pct !== null ? `(${pct.toFixed(0)}% of safe range)` : ""}
Current flow: ${point.currentFlow !== null ? point.currentFlow + " m³/h" : "N/A"}
Current temp: ${point.currentTemp !== null ? point.currentTemp + " °C" : "N/A"}
Status: ${point.status}
Last reading: ${point.lastReadingAt?.toISOString() ?? "never"}

RECENT READINGS (last 10):
${recentReadings.length > 0 ? JSON.stringify(recentReadings, null, 2) : "No historical readings available"}

Respond with this exact JSON:
{
  "risk": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NO_DATA",
  "riskAr": "منخفض" | "متوسط" | "مرتفع" | "حرج" | "لا بيانات",
  "confidence": 0.0 to 1.0,
  "summary": "1-2 sentences in English — current condition and key concern",
  "summaryAr": "جملة أو جملتان بالعربية عن الحالة الحالية",
  "trend": "STABLE" | "RISING" | "FALLING" | "UNSTABLE" | "UNKNOWN",
  "recommendations": ["English action 1", "English action 2", "English action 3"],
  "recommendationsAr": ["توصية بالعربية 1", "توصية بالعربية 2"],
  "maintenanceFlag": true | false
}`;

    const t0       = Date.now();
    const response = await claudeChat({
      system:    systemPrompt,
      messages:  [{ role: "user", content: userPrompt }],
      temperature: 0.2,
      maxTokens:   800,
    });

    const raw       = response.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude returned no JSON");

    const analysis = JSON.parse(jsonMatch[0]);

    return ok({
      point: {
        code:        point.code,
        positionKm:  point.positionKm,
        latitude:    point.latitude,
        longitude:   point.longitude,
        pressure,
        flow:        point.currentFlow,
        temp:        point.currentTemp,
        status:      point.status,
        lastReadingAt: point.lastReadingAt,
      },
      pipeline: { code: pipeline.code, name: pipeline.name },
      analysis,
      meta: { durationMs: Date.now() - t0, model: response.model },
    });
  } catch (err: any) {
    console.error("[point-analysis]", err);
    return fail("INTERNAL_ERROR", err.message || "Analysis failed", 500);
  }
}
