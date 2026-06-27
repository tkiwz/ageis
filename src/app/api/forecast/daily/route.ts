import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Rule-based fallback forecast (no AI needed) ─────────────────
async function buildLocalForecast() {
  const now = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lastWeek  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

  const [latestSensor, incidentCount, alertCount, activeLeaks, activePermits] = await Promise.all([
    db.vehicleReading.findFirst({ orderBy: { recordedAt: "desc" } }),
    db.incident.count({ where: { reportedAt: { gte: lastWeek } } }),
    db.alert.count({ where: { status: "PENDING" } }),
    db.leakAlert.count({ where: { status: { in: ["ACTIVE", "INVESTIGATING"] } } }).catch(() => 0),
    db.permit.count({ where: { status: { in: ["ACTIVE", "APPROVED"] } } }),
  ]);

  const gas  = latestSensor?.gasVal     ?? 0;
  const temp = latestSensor?.temperature ?? 0;

  // ── Determine overall risk ───────────────────────────────────
  let overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  if (gas > 80 || temp > 50 || activeLeaks > 2 || incidentCount > 5) overallRisk = "CRITICAL";
  else if (gas > 50 || temp > 40 || activeLeaks > 0 || incidentCount > 3) overallRisk = "HIGH";
  else if (gas > 30 || temp > 35 || alertCount > 3 || incidentCount > 1) overallRisk = "MEDIUM";

  // ── Build risk factors ───────────────────────────────────────
  const riskFactors: Array<{ factor: string; factorAr: string; weight: "LOW" | "MEDIUM" | "HIGH" }> = [];

  if (gas > 50)       riskFactors.push({ factor: `Gas Level Critical (${gas} ppm)`,  factorAr: `مستوى غاز حرج (${gas} ppm)`,  weight: "HIGH"   });
  else if (gas > 30)  riskFactors.push({ factor: `Gas Level Elevated (${gas} ppm)`,  factorAr: `مستوى غاز مرتفع (${gas} ppm)`, weight: "MEDIUM" });

  if (temp > 40)      riskFactors.push({ factor: `High Temperature (${temp.toFixed(1)}°C)`,  factorAr: `حرارة مرتفعة (${temp.toFixed(1)}°C)`,  weight: "HIGH"   });
  else if (temp > 35) riskFactors.push({ factor: `Warm Conditions (${temp.toFixed(1)}°C)`,   factorAr: `درجة حرارة دافئة (${temp.toFixed(1)}°C)`, weight: "MEDIUM" });

  if (incidentCount > 0) riskFactors.push({
    factor: `${incidentCount} Incident${incidentCount > 1 ? "s" : ""} This Week`,
    factorAr: `${incidentCount} حادثة هذا الأسبوع`,
    weight: incidentCount > 3 ? "HIGH" : "MEDIUM",
  });

  if (alertCount > 0) riskFactors.push({
    factor: `${alertCount} Active Alert${alertCount > 1 ? "s" : ""}`,
    factorAr: `${alertCount} تنبيه نشط`,
    weight: alertCount > 2 ? "HIGH" : "LOW",
  });

  if (activeLeaks > 0) riskFactors.push({
    factor: `${activeLeaks} Pipeline Leak${activeLeaks > 1 ? "s" : ""} Active`,
    factorAr: `${activeLeaks} تسرب أنبوب نشط`,
    weight: "HIGH",
  });

  if (riskFactors.length === 0) {
    riskFactors.push({ factor: "All Systems Normal", factorAr: "جميع الأنظمة طبيعية", weight: "LOW" });
  }

  // ── Headline ─────────────────────────────────────────────────
  const headlines: Record<string, { en: string; ar: string }> = {
    CRITICAL: {
      en: "Critical conditions detected — immediate action required across all sites",
      ar: "تم رصد أوضاع حرجة — يلزم التدخل الفوري في جميع المواقع",
    },
    HIGH: {
      en: "Elevated risk for tomorrow — heightened monitoring and precautions advised",
      ar: "خطر مرتفع للغد — ينصح بتكثيف المراقبة واتخاذ الاحتياطات",
    },
    MEDIUM: {
      en: "Moderate risk forecast — standard monitoring protocols in effect",
      ar: "توقعات بخطر معتدل — بروتوكولات المراقبة القياسية سارية",
    },
    LOW: {
      en: "Low risk forecast — all sites operating within safe parameters",
      ar: "توقعات بخطر منخفض — جميع المواقع تعمل ضمن المعايير الآمنة",
    },
  };

  const headline = headlines[overallRisk];

  // ── Recommendations ──────────────────────────────────────────
  const recommendations: string[] = [];
  const recommendationsAr: string[] = [];

  if (gas > 50) {
    recommendations.push("Immediately evacuate personnel from high-gas areas and activate ventilation systems");
    recommendationsAr.push("إخلاء الموظفين فوراً من مناطق الغاز العالي وتشغيل أنظمة التهوية");
  } else if (gas > 30) {
    recommendations.push("Monitor gas levels closely and ensure ventilation is adequate");
    recommendationsAr.push("مراقبة مستويات الغاز عن كثب والتأكد من كفاية التهوية");
  }
  if (temp > 40) {
    recommendations.push("Restrict outdoor work during peak heat hours and ensure hydration stations are stocked");
    recommendationsAr.push("تقييد العمل الخارجي خلال ساعات الذروة وضمان توفر محطات الترطيب");
  } else if (temp > 35) {
    recommendations.push("Implement heat stress protocols for outdoor workers");
    recommendationsAr.push("تطبيق بروتوكولات الإجهاد الحراري على العمال في الخارج");
  }
  if (incidentCount > 0) {
    recommendations.push(`Review the ${incidentCount} recent incident${incidentCount > 1 ? "s" : ""} and ensure corrective actions are in progress`);
    recommendationsAr.push(`مراجعة الحوادث الأخيرة (${incidentCount}) والتأكد من تنفيذ الإجراءات التصحيحية`);
  }
  if (activeLeaks > 0) {
    recommendations.push("Deploy rapid response teams to active pipeline leak locations");
    recommendationsAr.push("نشر فرق الاستجابة السريعة في مواقع التسرب النشطة");
  }
  if (recommendations.length === 0) {
    recommendations.push("Maintain standard safety rounds and ensure all permits are up to date");
    recommendations.push("Conduct morning toolbox talks emphasizing site-specific hazards");
    recommendationsAr.push("الحفاظ على جولات السلامة المعيارية والتأكد من تحديث جميع التصاريح");
    recommendationsAr.push("إجراء اجتماعات الصندوق الصباحية مع التركيز على المخاطر الخاصة بالموقع");
  }

  // ── Sites at risk ────────────────────────────────────────────
  const sitesAtRisk: Array<{ siteCode: string; siteName: string; risk: string; reason: string }> = [];
  if (latestSensor && (gas > 30 || temp > 35)) {
    sitesAtRisk.push({
      siteCode: latestSensor.siteCode ?? "SITE-01",
      siteName: "Primary Site",
      risk: overallRisk,
      reason: gas > 30 ? `Gas: ${gas} ppm, Temp: ${temp.toFixed(1)}°C` : `Temp: ${temp.toFixed(1)}°C`,
    });
  }

  const confidence = overallRisk === "LOW" ? 0.85
    : overallRisk === "MEDIUM" ? 0.78
    : overallRisk === "HIGH"   ? 0.82
    : 0.90;

  return {
    generatedAt: now.toISOString(),
    overallRisk,
    headline:          headline.en,
    headlineAr:        headline.ar,
    riskFactors,
    recommendations,
    recommendationsAr,
    sitesAtRisk,
    confidence,
    fromCache: false,
    source: "rule-based",
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    // Try cached AI forecast first
    const since  = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const cached = await db.aIInsight.findFirst({
      where: { insightType: "DAILY_FORECAST", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      try {
        const parsed = JSON.parse(cached.content);
        return NextResponse.json({ ok: true, data: { ...parsed, fromCache: true, generatedAt: cached.createdAt.toISOString() } });
      } catch { /* bad cache — regenerate */ }
    }

    // No cache — try AI, fall back to rule-based
    try {
      const { getDailyForecast } = await import("@/lib/autonomy/forecast");
      const result = await getDailyForecast(false);
      if ("blocked" in result) throw new Error(result.blocked);
      return NextResponse.json({ ok: true, data: result });
    } catch {
      // AI unavailable — use rule-based forecast
      const forecast = await buildLocalForecast();
      return NextResponse.json({ ok: true, data: forecast });
    }
  } catch (err) {
    console.error("[forecast GET]", err);
    try {
      const forecast = await buildLocalForecast();
      return NextResponse.json({ ok: true, data: forecast });
    } catch (e2) {
      console.error("[forecast fallback]", e2);
      return NextResponse.json({ ok: false, error: "Forecast unavailable" }, { status: 500 });
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { getDailyForecast } = await import("@/lib/autonomy/forecast");
    const result = await getDailyForecast(true);
    if ("blocked" in result) throw new Error(result.blocked);
    return NextResponse.json({ ok: true, data: result });
  } catch {
    const forecast = await buildLocalForecast();
    return NextResponse.json({ ok: true, data: forecast });
  }
}
