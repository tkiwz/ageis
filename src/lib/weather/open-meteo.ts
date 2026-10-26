/**
 * Real weather for every site from Open-Meteo (free, no key, CC BY 4.0).
 *
 * One forecast call + one air-quality call cover all sites. Readings are stored
 * in WeatherReading at most every REFRESH_MS; heat-stress and dust thresholds
 * raise a dashboard alert (once per site per condition while it stays open).
 */
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";

const REFRESH_MS = 30 * 60_000;
const KEEP_DAYS = 30;
export const WEATHER_SOURCE = "Open-Meteo (CC BY 4.0)";

/**
 * Heat stress uses the feels-like temperature. 46 °C / 54 °C follow the common
 * heat-index bands ("danger" / "extreme danger") used for outdoor work rest cycles.
 */
export const HEAT_WARNING_C = 46;
export const HEAT_CRITICAL_C = 54;
/** Dust ≥ 600 µg/m³ or wind ≥ 45 km/h → visibility / sandstorm risk for driving and lifting. */
export const DUST_WARNING = 600;
export const WIND_WARNING_KMH = 45;

let lastAttempt = 0;
let inflight: Promise<void> | null = null;

/** WMO weather code → condition key (translated in enums.weatherCondition). */
export function conditionFromCode(code: number): string {
  if (code === 0) return "CLEAR";
  if (code <= 2) return "PARTLY_CLOUDY";
  if (code === 3) return "CLOUDY";
  if (code === 45 || code === 48) return "FOG";
  if (code >= 51 && code <= 57) return "DRIZZLE";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "RAIN";
  if (code >= 95) return "THUNDERSTORM";
  return "CLOUDY";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

interface Current { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; wind_direction_10m: number; weather_code: number }
interface AirCurrent { us_aqi: number | null; dust: number | null }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json() as Promise<T>;
}

/** Fetch and store current weather for all active sites unless it was done recently. */
export function syncWeather(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight) return inflight;
  if (!opts.force && Date.now() - lastAttempt < 60_000) return Promise.resolve();
  lastAttempt = Date.now();
  inflight = run(opts.force ?? false).finally(() => { inflight = null; });
  return inflight;
}

async function run(force: boolean) {
  if (!force) {
    const latest = await db.weatherReading.findFirst({ orderBy: { recordedAt: "desc" }, select: { recordedAt: true } });
    if (latest && Date.now() - latest.recordedAt.getTime() < REFRESH_MS) return;
  }
  const sites = await db.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, code: true, name: true, nameAr: true, latitude: true, longitude: true },
    orderBy: { code: "asc" },
  });
  if (sites.length === 0) return;

  const lat = sites.map((s) => s.latitude.toFixed(4)).join(",");
  const lng = sites.map((s) => s.longitude.toFixed(4)).join(",");
  const one = <T,>(x: T | T[]) => (Array.isArray(x) ? x : [x]);

  try {
    const [wx, air] = await Promise.all([
      getJson<{ current: Current } | { current: Current }[]>(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code",
      ),
      // Air quality is a nice-to-have: weather is still stored if it fails
      getJson<{ current: AirCurrent } | { current: AirCurrent }[]>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,dust`,
      ).catch(() => null),
    ]);
    const weather = one(wx);
    const airList = air ? one(air) : [];
    const now = new Date();

    const rows = sites.flatMap((s, i) => {
      const c = weather[i]?.current;
      if (!c) return [];
      const a = airList[i]?.current;
      const heat = c.apparent_temperature >= HEAT_WARNING_C;
      const dusty = (a?.dust ?? 0) >= DUST_WARNING || c.wind_speed_10m >= WIND_WARNING_KMH;
      return [{
        siteId: s.id,
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        windSpeed: c.wind_speed_10m,
        windDirection: compass(c.wind_direction_10m),
        condition: conditionFromCode(c.weather_code),
        aqi: Math.round(a?.us_aqi ?? 0),
        dust: a?.dust ?? null,
        source: WEATHER_SOURCE,
        alertTriggered: heat || dusty,
        recordedAt: now,
        _site: s,
      }];
    });

    await db.weatherReading.createMany({ data: rows.map(({ _site, ...r }) => r) });
    for (const r of rows) await raiseAlerts(r._site, r);

    // Keep the table small: one month of history is plenty for trends
    if (Math.random() < 0.05) {
      await db.weatherReading.deleteMany({ where: { recordedAt: { lt: new Date(Date.now() - KEEP_DAYS * 864e5) } } });
    }
  } catch (err) {
    log.warn("weather sync failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function raiseAlerts(
  site: { id: string; name: string; nameAr: string | null },
  r: { feelsLike: number; windSpeed: number; dust: number | null },
) {
  const label = site.nameAr ?? site.name;
  const candidates: { key: string; type: string; title: string; message: string }[] = [];
  if (r.feelsLike >= HEAT_WARNING_C) {
    const critical = r.feelsLike >= HEAT_CRITICAL_C;
    candidates.push({
      key: "HEAT",
      type: critical ? "CRITICAL" : "WARNING",
      title: `إجهاد حراري — ${label}`,
      message: `الإحساس الحراري ${Math.round(r.feelsLike)}°م. طبّق دورات الراحة والسوائل وأوقف الأعمال الشاقة في الشمس. (Heat stress: feels like ${Math.round(r.feelsLike)}°C)`,
    });
  }
  if ((r.dust ?? 0) >= DUST_WARNING || r.windSpeed >= WIND_WARNING_KMH) {
    candidates.push({
      key: "DUST",
      type: "WARNING",
      title: `غبار ورياح قوية — ${label}`,
      message: `الرياح ${Math.round(r.windSpeed)} كم/س${r.dust != null ? `، الغبار ${Math.round(r.dust)} ميكروغرام/م³` : ""}. راجع أعمال الرفع والقيادة. (Dust / high wind)`,
    });
  }
  for (const c of candidates) {
    // Don't repeat while the same condition's alert is still open
    const open = await db.alert.findFirst({
      where: { siteId: site.id, acknowledgedAt: null, title: c.title, createdAt: { gte: new Date(Date.now() - 12 * 3600_000) } },
      select: { id: true },
    });
    if (open) continue;
    await db.alert.create({
      data: {
        type: c.type, title: c.title, message: c.message, siteId: site.id,
        channels: JSON.stringify(["DASHBOARD"]), status: "ACTIVE", isAutonomous: true,
      },
    });
  }
}
