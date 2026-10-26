import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { syncWeather, WEATHER_SOURCE } from "@/lib/weather/open-meteo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/weather — latest real reading per visible site (refreshes from Open-Meteo every 30 min). */
export async function GET() {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;

  await syncWeather();

  const sites = await db.site.findMany({
    where: { status: "ACTIVE", ...scope.where("id") },
    select: {
      id: true, code: true, name: true, nameAr: true,
      weatherReadings: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
    orderBy: { code: "asc" },
  });

  return ok({
    source: WEATHER_SOURCE,
    sites: sites
      .filter((s) => s.weatherReadings.length > 0)
      .map(({ weatherReadings: [w], ...s }) => ({
        ...s,
        temperature: w.temperature,
        feelsLike: w.feelsLike,
        humidity: w.humidity,
        windSpeed: w.windSpeed,
        windDirection: w.windDirection,
        condition: w.condition,
        aqi: w.aqi,
        dust: w.dust,
        alert: w.alertTriggered,
        recordedAt: w.recordedAt.toISOString(),
      })),
  });
}
