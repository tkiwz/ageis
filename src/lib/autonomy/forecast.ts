/**
 * Daily Predictive Forecast — generated once every N hours, cached in DB
 * via AIInsight (insightType="DAILY_FORECAST").
 *
 * Pipeline:
 *   1. Pull yesterday's incidents + observations + leak alerts
 *   2. Pull active permits + their risk levels
 *   3. Pull latest weather readings across all sites
 *   4. Pull last-7-day trend
 *   5. Ask Claude for a structured forecast (JSON)
 *   6. Persist + return
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";

const FORECAST_TTL_HOURS = 6;
const INSIGHT_TYPE = "DAILY_FORECAST";

export interface ForecastRiskFactor {
  factor: string;
  factorAr: string;
  weight: "LOW" | "MEDIUM" | "HIGH";
}

export interface DailyForecast {
  generatedAt: string;
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  headline: string;
  headlineAr: string;
  riskFactors: ForecastRiskFactor[];
  recommendations: string[];
  recommendationsAr: string[];
  sitesAtRisk: { siteCode: string; siteName: string; risk: string; reason: string }[];
  confidence: number;
  fromCache: boolean;
}

export async function getDailyForecast(force = false): Promise<DailyForecast | { blocked: string }> {
  // Check cache first
  const since = new Date(Date.now() - FORECAST_TTL_HOURS * 60 * 60 * 1000);
  const cached = await db.aIInsight.findFirst({
    where: { insightType: INSIGHT_TYPE, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  if (cached && !force) {
    try {
      const parsed = JSON.parse(cached.content) as DailyForecast;
      return { ...parsed, fromCache: true, generatedAt: cached.createdAt.toISOString() };
    } catch {
      // fallthrough — regenerate
    }
  }

  // Gather signals
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [
    incidentsYesterday,
    incidentsLastWeek,
    activePermits,
    activeAlerts,
    activeLeaks,
    weather,
    sites,
  ] = await Promise.all([
    db.incident.findMany({
      where: { reportedAt: { gte: yesterday } },
      select: { type: true, severity: true, location: true, siteId: true },
    }),
    db.incident.count({ where: { reportedAt: { gte: lastWeek } } }),
    db.permit.findMany({
      where: { status: { in: ["ACTIVE", "APPROVED"] }, validUntil: { gte: new Date() } },
      select: { type: true, riskLevel: true, location: true, siteId: true },
    }),
    db.alert.count({ where: { status: "PENDING" } }),
    db.leakAlert.count({ where: { status: { in: ["ACTIVE", "INVESTIGATING"] } } }),
    db.weatherReading.findMany({
      orderBy: { recordedAt: "desc" },
      take: 10,
      select: { temperature: true, humidity: true, windSpeed: true, aqi: true, condition: true, siteId: true },
    }),
    db.site.findMany({ select: { id: true, code: true, name: true, riskLevel: true, status: true } }),
  ]);

  // If we don't have enough data — return a low-confidence stub.
  if (sites.length === 0) {
    const stub: DailyForecast = {
      generatedAt: new Date().toISOString(),
      overallRisk: "LOW",
      headline: "Insufficient operational data — forecast unavailable.",
      headlineAr: "بيانات تشغيلية غير كافية لتوليد توقع.",
      riskFactors: [],
      recommendations: ["Seed sites and run sensors to enable forecasts."],
      recommendationsAr: ["أضف مواقع وأجهزة استشعار لتفعيل التوقعات."],
      sitesAtRisk: [],
      confidence: 0,
      fromCache: false,
    };
    return stub;
  }

  // Compose input for Claude
  const dataBlob = {
    today: new Date().toISOString().slice(0, 10),
    tomorrow: tomorrow.toISOString().slice(0, 10),
    incidentsYesterday: incidentsYesterday.length,
    incidentSamples: incidentsYesterday.slice(0, 5),
    incidentsLast7Days: incidentsLastWeek,
    activePermits: activePermits.length,
    permitSamples: activePermits.slice(0, 5),
    pendingAlerts: activeAlerts,
    activeLeaks,
    weatherLatest: weather.slice(0, 5),
    sites: sites.map((s) => ({ code: s.code, name: s.name, risk: s.riskLevel, status: s.status })),
  };

  const systemPrompt = `You are AEGIS's chief HSSE risk forecaster for OQ operations in Oman.
You receive daily operational data and predict tomorrow's HSSE risk profile.
Be calibrated: not every day is HIGH risk. CRITICAL is reserved for clear and present danger.
You consider Omani context: desert heat in summer, monsoon (khareef) in Dhofar Jun-Sep, sandstorms, contractor patterns.
Respond ONLY in valid JSON.`;

  const userPrompt = `Generate tomorrow's risk forecast from this operational snapshot:

${JSON.stringify(dataBlob, null, 2)}

Respond in this exact JSON shape:
{
  "overallRisk": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "headline": "One sentence in English summarising tomorrow's risk",
  "headlineAr": "جملة واحدة بالعربية تلخّص المخاطر",
  "riskFactors": [
    { "factor": "Heat stress above 45°C", "factorAr": "إجهاد حراري فوق 45 مئوية", "weight": "HIGH" }
  ],
  "recommendations": ["English action 1", "English action 2", "English action 3"],
  "recommendationsAr": ["إجراء بالعربية 1", "إجراء بالعربية 2", "إجراء بالعربية 3"],
  "sitesAtRisk": [
    { "siteCode": "SITE-XX", "siteName": "Site Name", "risk": "HIGH", "reason": "Why" }
  ],
  "confidence": 0.0
}

Keep arrays short (3-5 items). Be specific to the data, not generic.`;

  const r = await guardedClaudeChat({
    module: "forecast",
    feature: "daily-forecast",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1500,
    temperature: 0.4,
    autonomous: true,
    decisionType: "DAILY_FORECAST",
    inputSnapshot: dataBlob,
  });

  if (r.blocked) return { blocked: r.blocked.reason };

  // Parse
  const jsonMatch = r.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { blocked: "Claude did not return valid JSON" };

  let parsed: Omit<DailyForecast, "generatedAt" | "fromCache">;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    return { blocked: `JSON parse error: ${(err as Error).message}` };
  }

  // Defensive validation on Claude output
  const VALID_RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const VALID_WEIGHTS = ["LOW", "MEDIUM", "HIGH"] as const;
  if (!VALID_RISKS.includes(parsed.overallRisk as typeof VALID_RISKS[number])) {
    parsed.overallRisk = "MEDIUM"; // safe fallback
  }
  if (!Array.isArray(parsed.riskFactors)) parsed.riskFactors = [];
  if (!Array.isArray(parsed.recommendations)) parsed.recommendations = [];
  if (!Array.isArray(parsed.recommendationsAr)) parsed.recommendationsAr = [];
  if (!Array.isArray(parsed.sitesAtRisk)) parsed.sitesAtRisk = [];
  parsed.riskFactors = parsed.riskFactors.map((f) => ({
    ...f,
    weight: VALID_WEIGHTS.includes(f.weight as typeof VALID_WEIGHTS[number]) ? f.weight : "MEDIUM",
  }));
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));

  const forecast: DailyForecast = {
    ...parsed,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  // Persist via AIInsight (acts as cache + audit)
  await db.aIInsight.create({
    data: {
      insightType: INSIGHT_TYPE,
      module: "forecast",
      title: forecast.headline.slice(0, 200),
      content: JSON.stringify(forecast),
      confidence: forecast.confidence,
      metadata: JSON.stringify({ decisionId: r.decisionId, dataBlob }),
    },
  });

  return forecast;
}
