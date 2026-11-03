/**
 * Point forecasts from MET Norway (api.met.no Locationforecast 2.0): free, commercial
 * use allowed with credit (CC BY 4.0), any point on Earth, ~9 days.
 *
 * Hourly for the first ~2.5 days, then 6-hourly; we interpolate to hourly so the
 * charts read the same. Their terms ask for an identifying User-Agent and caching.
 */
const UA = "AEGIS-observatory/1.0 (+https://ageis-five.vercel.app)";

interface Step {
  time: string;
  data: {
    instant: { details: Record<string, number | undefined> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number; probability_of_precipitation?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number; probability_of_precipitation?: number } };
  };
}

/** MET symbol → WMO-style code, so the rest of the app needs no second vocabulary. */
export function symbolToWmo(symbol: string | undefined): number {
  const s = symbol ?? "";
  if (s.includes("thunder")) return 95;
  if (s.startsWith("heavyrain")) return s.includes("showers") ? 82 : 65;
  if (s.startsWith("lightrain")) return s.includes("showers") ? 80 : 61;
  if (s.startsWith("rain")) return s.includes("showers") ? 81 : 63;
  if (s.includes("sleet")) return 67;
  if (s.includes("snow")) return 73;
  if (s.startsWith("fog")) return 45;
  if (s.startsWith("cloudy")) return 3;
  if (s.startsWith("partlycloudy")) return 2;
  if (s.startsWith("fair")) return 1;
  return 0;
}

export interface HourlyPoint {
  time: string; // UTC ISO, on the hour
  temp: number; feels: number; humidity: number; wind: number; gust: number; dir: number; uv: number;
  rain: number; rainProb: number | null; code: number;
}

/** Hourly series for `hours` hours from now (interpolated after the hourly part ends). */
export async function metnoHourly(lat: number, lon: number, hours = 168): Promise<HourlyPoint[]> {
  const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, {
    headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`met.no ${r.status}`);
  const steps = ((await r.json()) as { properties: { timeseries: Step[] } }).properties.timeseries;
  if (!steps?.length) throw new Error("met.no: empty");

  const at = steps.map((s) => Date.parse(s.time));
  const val = (s: Step, k: string) => s.data.instant.details[k];
  const out: HourlyPoint[] = [];
  const start = Math.ceil(at[0] / 3600_000) * 3600_000;
  for (let h = 0; h < hours; h++) {
    const t = start + h * 3600_000;
    if (t > at[at.length - 1]) break;
    // Last step at or before t, and the next one; interpolate between them
    let k = 0;
    while (k + 1 < at.length && at[k + 1] <= t) k++;
    const a = steps[k], b = steps[Math.min(k + 1, steps.length - 1)];
    const f = b === a ? 0 : (t - at[k]) / (at[k + 1] - at[k]);
    const lerp = (key: string, fallback = 0) => {
      const va = val(a, key) ?? fallback, vb = val(b, key) ?? va;
      return va + (vb - va) * f;
    };
    // Rain: hourly amount where given, else the 6-hour amount of the step covering this hour, spread evenly
    const cover = a;
    const one = cover.data.next_1_hours && at[k] === t ? cover.data.next_1_hours : undefined;
    const six = cover.data.next_6_hours;
    const rain = one?.details?.precipitation_amount ?? (six?.details?.precipitation_amount ?? 0) / 6;
    const prob = one?.details?.probability_of_precipitation ?? six?.details?.probability_of_precipitation ?? null;
    const temp = lerp("air_temperature");
    const wind = lerp("wind_speed") * 3.6;
    out.push({
      time: new Date(t).toISOString(),
      temp, feels: lerp("apparent_air_temperature", temp), humidity: lerp("relative_humidity"),
      wind, // No gust in the feed for this area: show the mean wind rather than invent a gust
      gust: (val(b, "wind_speed_of_gust") ?? val(a, "wind_speed_of_gust") ?? wind / 3.6) * 3.6,
      dir: val(f < 0.5 ? a : b, "wind_from_direction") ?? 0, uv: lerp("ultraviolet_index_clear_sky"),
      rain, rainProb: prob, code: symbolToWmo((one ?? six ?? cover.data.next_1_hours)?.summary?.symbol_code),
    });
  }
  return out;
}

/** Sunrise / sunset (NOAA solar equations, ±1 min), UTC ISO for the given Oman date. */
export function sunTimes(date: string, lat: number, lon: number): { sunrise: string; sunset: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const n = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const rad = Math.PI / 180;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const minutes = (sign: 1 | -1) => 720 - 4 * (lon + sign * ha) - eq;
  const at = (m: number) => new Date(d.getTime() + m * 60_000).toISOString();
  return { sunrise: at(minutes(1)), sunset: at(minutes(-1)) };
}
