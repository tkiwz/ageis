import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { getForecastGrid } from "@/lib/observatory/grid";
import { computeWarnings, FEATURES, type Hazard, type Level } from "@/lib/observatory/warnings";
import { Observatory } from "@/components/observatory/observatory";

const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
const GOV_AR = Object.fromEntries(FEATURES.map((f) => [f.properties.iso, f.properties.nameAr]));
const HAZARD_AR: Record<Hazard, string> = { RAIN: "أمطار", WIND: "رياح قوية", STORM: "عواصف رعدية", HEAT: "حرارة شديدة", DUST: "غبار", FOG: "ضباب" };
const LEVEL_AR: Record<Level, string> = { 0: "", 1: "أصفر", 2: "برتقالي", 3: "أحمر" };

/** Today's headline for link previews (WhatsApp shows og:title + og:description). */
async function todaySummary(): Promise<string> {
  try {
    const w = computeWarnings(await getForecastGrid());
    const today = w.warnings.filter((x) => x.day === w.days[0] && x.level >= 2).sort((a, b) => b.level - a.level);
    if (!today.length) return "لا توجد إنذارات برتقالية أو حمراء اليوم. تابع خريطة الطقس لسبعة أيام.";
    return today.slice(0, 3).map((x) => `إنذار ${LEVEL_AR[x.level]}: ${HAZARD_AR[x.hazard]} في ${GOV_AR[x.iso]}`).join(" · ");
  } catch {
    return "توقعات الطقس والإنذارات لسلطنة عُمان لسبعة أيام.";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const summary = await todaySummary();
  return {
    metadataBase: new URL(SITE),
    title: t("observatory.title"),
    description: t("observatory.subtitle"),
    openGraph: {
      title: "مرصد AEGIS — إنذارات الطقس في عُمان",
      description: summary,
      url: "/observatory",
      type: "website",
      locale: "ar_OM",
    },
    twitter: { card: "summary_large_image", title: "مرصد AEGIS — إنذارات الطقس في عُمان", description: summary },
  };
}

/** Public page: forecast map and governorate warnings for Oman. */
export default function ObservatoryPage() {
  return <Observatory />;
}
