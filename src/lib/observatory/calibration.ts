/**
 * Calibration: each global model is scored every day against what Oman's
 * airports actually reported (METAR, aviationweather.gov), using the forecast
 * that model issued the day before (Open-Meteo "previous runs").
 *
 *  - temperature: absolute error, hour by hour
 *  - rain: did the airport report rain (RA / DZ / SH / TS) in that hour, and did
 *    the model forecast ≥ 0.2 mm within an hour of it
 *
 * Scores accumulate in ModelVerification. Rain weights use the equitable threat
 * score once enough rain has been observed; until then temperature skill decides,
 * and with no history every model weighs the same.
 */
import { unstable_cache, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";
import { MODELS } from "./models";

export const STATIONS = [
  { icao: "OOMS", name: "Muscat", nameAr: "مسقط", lat: 23.593, lon: 58.284 },
  { icao: "OOSA", name: "Salalah", nameAr: "صلالة", lat: 17.039, lon: 54.091 },
  { icao: "OOSH", name: "Sohar", nameAr: "صحار", lat: 24.386, lon: 56.626 },
  { icao: "OODQ", name: "Duqm", nameAr: "الدقم", lat: 19.501, lon: 57.634 },
  { icao: "OOKB", name: "Khasab", nameAr: "خصب", lat: 26.171, lon: 56.241 },
] as const;

const RAIN_MM = 0.2;
const WINDOW_DAYS = 60;
const MIN_RAIN_EVENTS = 5;
const isRainWx = (wx: string | undefined) => !!wx && /(^|[\s+-])(RA|DZ|SH|TS)/.test(wx);

interface Metar { icaoId: string; reportTime: string; temp: number | null; wxString?: string }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json() as Promise<T>;
}

/** Score yesterday-issued forecasts against the last ~3 days of METARs; skips days already stored. */
export async function runVerification(): Promise<{ stored: number }> {
  const done = await db.modelVerification.findFirst({ orderBy: { day: "desc" }, select: { day: true } });
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (done && done.day.toISOString().slice(0, 10) >= yesterday) return { stored: 0 };

  const metars = await getJson<Metar[]>(
    `https://aviationweather.gov/api/data/metar?ids=${STATIONS.map((s) => s.icao).join(",")}&hours=96&format=json`,
  );
  // Observations per station per UTC hour
  const obs = new Map<string, { temp: number | null; rain: boolean }>();
  for (const m of metars) {
    const hour = m.reportTime.slice(0, 13);
    const k = `${m.icaoId}|${hour}`;
    const prev = obs.get(k);
    obs.set(k, { temp: m.temp ?? prev?.temp ?? null, rain: (prev?.rain ?? false) || isRainWx(m.wxString) });
  }

  const prev = await getJson<{ hourly: Record<string, (number | null)[] | string[]> }[]>(
    "https://previous-runs-api.open-meteo.com/v1/forecast"
    + `?latitude=${STATIONS.map((s) => s.lat).join(",")}&longitude=${STATIONS.map((s) => s.lon).join(",")}`
    + `&hourly=temperature_2m_previous_day1,precipitation_previous_day1&models=${MODELS.map((m) => m.id).join(",")}`
    + "&past_days=4&forecast_days=1&timezone=GMT",
  );

  const rows: { day: Date; station: string; model: string; hours: number; tempAbsErrSum: number; rainHits: number; rainMisses: number; rainFalse: number; rainNone: number }[] = [];
  STATIONS.forEach((st, si) => {
    const h = prev[si]?.hourly;
    if (!h) return;
    const times = h.time as string[];
    for (const m of MODELS) {
      const T = h[`temperature_2m_previous_day1_${m.id}`] as (number | null)[] | undefined;
      const P = h[`precipitation_previous_day1_${m.id}`] as (number | null)[] | undefined;
      if (!T && !P) continue;
      const byDay = new Map<string, { hours: number; err: number; hit: number; miss: number; fa: number; none: number }>();
      times.forEach((t, k) => {
        const day = t.slice(0, 10);
        if (day > yesterday || (done && day <= done.day.toISOString().slice(0, 10))) return;
        const o = obs.get(`${st.icao}|${t.slice(0, 13)}`);
        if (!o) return;
        const acc = byDay.get(day) ?? { hours: 0, err: 0, hit: 0, miss: 0, fa: 0, none: 0 };
        const tf = T?.[k];
        if (o.temp !== null && tf !== null && tf !== undefined) { acc.hours++; acc.err += Math.abs(tf - o.temp); }
        // Rain within ±1 h counts as forecast (timing of showers is uncertain)
        const wet = [k - 1, k, k + 1].some((j) => (P?.[j] ?? 0) >= RAIN_MM);
        if (o.rain && wet) acc.hit++; else if (o.rain) acc.miss++; else if (wet) acc.fa++; else acc.none++;
        byDay.set(day, acc);
      });
      for (const [day, a] of byDay) {
        if (a.hours === 0) continue;
        rows.push({ day: new Date(`${day}T00:00:00Z`), station: st.icao, model: m.id, hours: a.hours, tempAbsErrSum: a.err, rainHits: a.hit, rainMisses: a.miss, rainFalse: a.fa, rainNone: a.none });
      }
    }
  });

  if (rows.length) {
    await db.modelVerification.createMany({ data: rows, skipDuplicates: true });
    try { revalidateTag("model-weights"); } catch { /* outside a Next request (scripts) */ }
  }
  return { stored: rows.length };
}

let lastRun = 0;
/** Fire-and-forget-safe: at most one attempt per hour per instance, never throws. */
export async function maybeRunVerification() {
  if (Date.now() - lastRun < 3600_000) return;
  lastRun = Date.now();
  try { await runVerification(); } catch (err) { log.warn("model verification failed", { error: String(err) }); }
}

export interface ModelSkill {
  id: string;
  days: number;
  tempMae: number | null;
  rainEvents: number;
  /** Probability of detection / false-alarm ratio / equitable threat score for rain (null without events) */
  pod: number | null;
  far: number | null;
  ets: number | null;
  weight: number;
}

async function computeSkill(): Promise<{ since: string; models: ModelSkill[]; rainEvents: number }> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const rows = await db.modelVerification.groupBy({
    by: ["model"],
    where: { day: { gte: since } },
    _sum: { hours: true, tempAbsErrSum: true, rainHits: true, rainMisses: true, rainFalse: true, rainNone: true },
    _count: { _all: true },
  });
  const skills: ModelSkill[] = MODELS.map((m) => {
    const r = rows.find((x) => x.model === m.id);
    const s = r?._sum;
    const hits = s?.rainHits ?? 0, miss = s?.rainMisses ?? 0, fa = s?.rainFalse ?? 0, cn = s?.rainNone ?? 0;
    const n = hits + miss + fa + cn, events = hits + miss;
    const random = n ? ((hits + miss) * (hits + fa)) / n : 0;
    const ets = events > 0 && hits + miss + fa - random > 0 ? (hits - random) / (hits + miss + fa - random) : null;
    return {
      id: m.id,
      days: Math.round((r?._count._all ?? 0) / STATIONS.length),
      tempMae: s?.hours ? s.tempAbsErrSum! / s.hours : null,
      rainEvents: events,
      pod: events ? hits / events : null,
      far: hits + fa ? fa / (hits + fa) : null,
      ets,
      weight: 1,
    };
  });
  const rainEvents = Math.max(0, ...skills.map((s) => s.rainEvents));
  // Weights: rain skill when there's enough rain to judge, else temperature skill, else equal
  if (rainEvents >= MIN_RAIN_EVENTS) {
    for (const s of skills) s.weight = Math.max(0.2, (s.ets ?? 0) + 0.3);
  } else if (skills.every((s) => s.tempMae !== null)) {
    const best = Math.min(...skills.map((s) => s.tempMae!));
    for (const s of skills) s.weight = Math.max(0.3, best / s.tempMae!);
  }
  const total = skills.reduce((a, s) => a + s.weight, 0);
  for (const s of skills) s.weight = Math.round((s.weight / total) * skills.length * 100) / 100; // mean weight = 1
  return { since: since.toISOString().slice(0, 10), models: skills, rainEvents };
}

export const getModelSkill = unstable_cache(computeSkill, ["observatory-model-skill-v1"], { revalidate: 6 * 3600, tags: ["model-weights"] });

export async function getModelWeights(): Promise<Record<string, number>> {
  try {
    const { models } = await getModelSkill();
    return Object.fromEntries(models.map((m) => [m.id, m.weight]));
  } catch {
    return Object.fromEntries(MODELS.map((m) => [m.id, 1]));
  }
}
