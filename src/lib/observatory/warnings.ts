/**
 * Turns the forecast grid into per-governorate warnings (yellow / orange / red),
 * day by day in Oman time. A governorate takes the worst value of the grid
 * points that fall inside it — warnings are about the worst place, not the average.
 */
import governorates from "./oman-governorates.json";
import { GRID, NX, NY, type ForecastGrid } from "./grid";

export type Hazard = "RAIN" | "WIND" | "STORM" | "HEAT" | "FOG";
export type Level = 0 | 1 | 2 | 3; // none, yellow, orange, red

/** Thresholds per level [yellow, orange, red]. */
export const THRESHOLDS = {
  RAIN: [10, 25, 50],   // mm in a day — 25+ starts wadi flow in the mountains
  WIND: [45, 60, 80],   // km/h gusts — 45 stops crane lifts, 60 damages loose structures
  HEAT: [45, 48, 50],   // °C air temperature
} as const;

export interface Warning {
  iso: string;
  hazard: Hazard;
  level: Level;
  day: string;      // YYYY-MM-DD, Oman time
  from: string;     // UTC ISO, first step of the event that day
  to: string;       // UTC ISO, end of the last step
  peak: number;     // mm / km/h / °C (0 for storm / fog)
}
export interface WarningsResult {
  generatedAt: string;
  days: string[];
  /** iso → worst level per day */
  levels: Record<string, Level[]>;
  warnings: Warning[];
}

const OMAN_OFFSET_MS = 4 * 3600_000;
const STEP_MS = 3 * 3600_000;

type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
interface GovFeature { properties: { iso: string; name: string; nameAr: string }; geometry: Geometry }
const FEATURES = (governorates as unknown as { features: GovFeature[] }).features;

function inRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const [xa, ya] = ring[a], [xb, yb] = ring[b];
    if (ya > lat !== yb > lat && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}
function inGeometry(lon: number, lat: number, g: Geometry) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}

/** Grid indices for each governorate. Small ones (Musandam, Muscat) also take the points around them. */
let membership: Map<string, number[]> | null = null;
function members() {
  if (membership) return membership;
  membership = new Map();
  for (const f of FEATURES) {
    const idx: number[] = [];
    const near: { n: number; d: number }[] = [];
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) for (const [x, y] of p[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const lat = GRID.lat0 + j * GRID.step, lon = GRID.lon0 + i * GRID.step, n = j * NX + i;
      if (inGeometry(lon, lat, f.geometry)) idx.push(n);
      else if (lon >= minX - GRID.step && lon <= maxX + GRID.step && lat >= minY - GRID.step && lat <= maxY + GRID.step) {
        near.push({ n, d: Math.hypot(lon - (minX + maxX) / 2, lat - (minY + maxY) / 2) });
      }
    }
    if (idx.length < 3) idx.push(...near.sort((a, b) => a.d - b.d).slice(0, 3 - idx.length).map((x) => x.n));
    membership.set(f.properties.iso, idx);
  }
  return membership;
}

const levelOf = (v: number, th: readonly number[]): Level => (v >= th[2] ? 3 : v >= th[1] ? 2 : v >= th[0] ? 1 : 0);
const omanDay = (iso: string) => new Date(Date.parse(iso) + OMAN_OFFSET_MS).toISOString().slice(0, 10);

export function computeWarnings(g: ForecastGrid): WarningsResult {
  const N = g.grid.nx * g.grid.ny;
  const dayOf = g.times.map(omanDay);
  const days = [...new Set(dayOf)];
  const levels: Record<string, Level[]> = {};
  const warnings: Warning[] = [];

  for (const [iso, idx] of members()) {
    levels[iso] = days.map(() => 0 as Level);
    days.forEach((day, d) => {
      const steps = g.times.map((_, t) => t).filter((t) => dayOf[t] === day);
      const push = (hazard: Hazard, level: Level, hit: number[], peak: number) => {
        if (!level || hit.length === 0) return;
        warnings.push({
          iso, hazard, level, day, peak,
          from: g.times[hit[0]],
          to: new Date(Date.parse(g.times[hit[hit.length - 1]]) + STEP_MS).toISOString(),
        });
        if (level > levels[iso][d]) levels[iso][d] = level;
      };
      const worst = (arr: number[], t: number) => Math.max(...idx.map((n) => arr[t * N + n]));

      // Rain: daily total at the wettest point
      const dayRain = Math.max(...idx.map((n) => steps.reduce((s, t) => s + g.rain[t * N + n], 0)));
      push("RAIN", levelOf(dayRain, THRESHOLDS.RAIN), steps.filter((t) => worst(g.rain, t) >= 1), Math.round(dayRain));

      const gusts = steps.map((t) => worst(g.gust, t));
      const peakGust = Math.max(...gusts);
      push("WIND", levelOf(peakGust, THRESHOLDS.WIND), steps.filter((t, k) => gusts[k] >= THRESHOLDS.WIND[0]), Math.round(peakGust));

      const temps = steps.map((t) => worst(g.temp, t));
      const peakTemp = Math.max(...temps);
      push("HEAT", levelOf(peakTemp, THRESHOLDS.HEAT), steps.filter((t, k) => temps[k] >= THRESHOLDS.HEAT[0]), Math.round(peakTemp));

      // Thunderstorm (95) → orange; with hail (96/99) → red
      const codes = steps.map((t) => worst(g.code, t));
      const storm = steps.filter((_, k) => codes[k] >= 95);
      push("STORM", codes.some((c) => c === 96 || c === 99) ? 3 : 2, storm, 0);

      // Fog (45/48) at any point
      const fog = steps.filter((t) => idx.some((n) => g.code[t * N + n] === 45 || g.code[t * N + n] === 48));
      push("FOG", 1, fog, 0);
    });
  }

  const order: Record<Hazard, number> = { STORM: 0, RAIN: 1, WIND: 2, HEAT: 3, FOG: 4 };
  warnings.sort((a, b) => a.day.localeCompare(b.day) || b.level - a.level || order[a.hazard] - order[b.hazard]);
  return { generatedAt: g.generatedAt, days, levels, warnings };
}
