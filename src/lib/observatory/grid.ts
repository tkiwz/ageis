/**
 * Seven-day forecast on a regular 0.5° grid over Oman (Open-Meteo, CC BY 4.0).
 *
 * One request covers all 378 points at 3-hour steps. The compact result is kept
 * in the Next data cache for REVALIDATE_S, so Open-Meteo sees ~8 requests a day
 * no matter how many people open the observatory.
 */
import { unstable_cache } from "next/cache";

export const GRID = { lat0: 16.5, lat1: 26.5, lon0: 51.5, lon1: 60, step: 0.5 } as const;
export const NX = Math.round((GRID.lon1 - GRID.lon0) / GRID.step) + 1; // 18
export const NY = Math.round((GRID.lat1 - GRID.lat0) / GRID.step) + 1; // 21
const REVALIDATE_S = 3 * 3600;

export interface ForecastGrid {
  generatedAt: string;
  grid: typeof GRID & { nx: number; ny: number };
  /** UTC ISO times, one per 3-hour step */
  times: string[];
  /** Flat arrays indexed [t * ny * nx + j * nx + i], j = latitude row from lat0, i = longitude column from lon0 */
  temp: number[];   // °C
  rain: number[];   // mm in the 3-hour step
  wind: number[];   // km/h at 10 m
  dir: number[];    // degrees, direction the wind comes FROM
  gust: number[];   // km/h
  cloud: number[];  // %
  code: number[];   // WMO weather code
  /** Dust µg/m³ (CAMS, ~5 days); -1 where the air-quality forecast doesn't reach */
  dust: number[];
}

interface PointResponse {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    cloud_cover: (number | null)[];
    weather_code: (number | null)[];
  };
}

export function gridPoints(): { lat: number; lon: number }[] {
  const pts = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) pts.push({ lat: GRID.lat0 + j * GRID.step, lon: GRID.lon0 + i * GRID.step });
  return pts;
}

/** Dust per point at the given UTC times; -1 when unavailable. Never throws — dust is optional. */
async function fetchDust(pts: { lat: number; lon: number }[], times: string[]): Promise<number[]> {
  const N = pts.length, out = new Array<number>(times.length * N).fill(-1);
  try {
    const url = "https://air-quality-api.open-meteo.com/v1/air-quality"
      + `?latitude=${pts.map((p) => p.lat).join(",")}&longitude=${pts.map((p) => p.lon).join(",")}`
      + "&hourly=dust&forecast_days=5&timezone=GMT";
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(40_000) });
    if (!r.ok) return out;
    const body = (await r.json()) as { hourly: { time: string[]; dust: (number | null)[] } }[];
    if (!Array.isArray(body) || body.length !== N) return out;
    const at = new Map(body[0].hourly.time.map((t, k) => [`${t}:00Z`, k]));
    times.forEach((t, ti) => {
      const k = at.get(t);
      if (k === undefined) return;
      body.forEach((p, n) => { const v = p.hourly.dust[k]; if (v !== null) out[ti * N + n] = Math.round(v); });
    });
  } catch { /* weather still works without dust */ }
  return out;
}

async function fetchGrid(): Promise<ForecastGrid> {
  const pts = gridPoints();
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${pts.map((p) => p.lat).join(",")}&longitude=${pts.map((p) => p.lon).join(",")}` +
    "&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,weather_code" +
    "&forecast_days=7&temporal_resolution=hourly_3&timezone=GMT";
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const body = (await r.json()) as PointResponse[];
  if (!Array.isArray(body) || body.length !== pts.length) throw new Error("open-meteo: unexpected grid size");

  const times = body[0].hourly.time.map((t) => `${t}:00Z`);
  const T = times.length, N = pts.length;
  const out = {
    temp: new Array<number>(T * N), rain: new Array<number>(T * N), wind: new Array<number>(T * N),
    dir: new Array<number>(T * N), gust: new Array<number>(T * N), cloud: new Array<number>(T * N), code: new Array<number>(T * N),
  };
  const r1 = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
  const r0 = (v: number | null) => Math.round(v ?? 0);
  body.forEach((p, n) => {
    const h = p.hourly;
    for (let t = 0; t < T; t++) {
      const k = t * N + n;
      out.temp[k] = r1(h.temperature_2m[t]);
      out.rain[k] = r1(h.precipitation[t]);
      out.wind[k] = r0(h.wind_speed_10m[t]);
      out.dir[k] = r0(h.wind_direction_10m[t]);
      out.gust[k] = r0(h.wind_gusts_10m[t]);
      out.cloud[k] = r0(h.cloud_cover[t]);
      out.code[k] = r0(h.weather_code[t]);
    }
  });
  const dust = await fetchDust(pts, times);
  return { generatedAt: new Date().toISOString(), grid: { ...GRID, nx: NX, ny: NY }, times, ...out, dust };
}

export const getForecastGrid = unstable_cache(fetchGrid, ["observatory-grid-v2"], { revalidate: REVALIDATE_S });
