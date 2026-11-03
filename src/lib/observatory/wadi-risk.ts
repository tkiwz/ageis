/**
 * Wadi flood risk: forecast rain summed per day along each named wadi's whole
 * course (OSM), where it falls hardest. A wadi can flow under a clear sky if
 * rain falls up its course in the mountains, so the whole line counts, not
 * just the town at its mouth. Road crossings at ground level and fords on the
 * wadi are listed: that's where people get caught.
 */
import { unstable_cache } from "next/cache";
import wadiData from "./wadis.json";
import { getForecastGrid, type ForecastGrid } from "./grid";
import { governorateOf, type Level } from "./warnings";

/** mm in a day along the wadi: watch / likely to flow / dangerous */
export const WADI_MM = [10, 20, 40] as const;

interface WadiIn { name: string; nameAr: string; km: number; lines: [number, number][][] }
const DATA = wadiData as unknown as { wadis: WadiIn[]; crossings: [number, number, number, number][] };

export interface WadiRisk {
  id: number; name: string; nameAr: string; km: number; gov: string | null;
  levels: Level[]; peakMm: number[];
  /** where the heaviest rain on the wadi falls, per day [lon, lat] */
  peakAt: [number, number][];
  lines: [number, number][][];
  /** at-grade road crossings and fords on this wadi [lon, lat, ford] */
  crossings: [number, number, number][];
}
export interface WadiRiskResult { days: string[]; wadis: WadiRisk[] }

function bilinear(g: ForecastGrid, arr: number[], base: number, lat: number, lon: number) {
  const { lat0, lon0, step, nx, ny } = g.grid;
  const fx = (lon - lon0) / step, fy = (lat - lat0) / step;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return 0;
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), dx = fx - i, dy = fy - j, n = base + j * nx + i;
  return (arr[n] * (1 - dx) + arr[n + 1] * dx) * (1 - dy) + (arr[n + nx] * (1 - dx) + arr[n + nx + 1] * dx) * dy;
}
const omanDay = (iso: string) => new Date(Date.parse(iso) + 4 * 3600_000).toISOString().slice(0, 10);
const levelOf = (mm: number): Level => (mm >= WADI_MM[2] ? 3 : mm >= WADI_MM[1] ? 2 : mm >= WADI_MM[0] ? 1 : 0);

export function computeWadiRisk(g: ForecastGrid): WadiRiskResult {
  const N = g.grid.nx * g.grid.ny;
  const dayOf = g.times.map(omanDay);
  const days = [...new Set(dayOf)];
  const out: WadiRisk[] = [];
  DATA.wadis.forEach((w, id) => {
    const verts = w.lines.flat();
    const levels: Level[] = [], peakMm: number[] = [], peakAt: [number, number][] = [];
    for (const day of days) {
      let best = 0, at: [number, number] = verts[0];
      for (const [lon, lat] of verts) {
        let sum = 0;
        g.times.forEach((_, t) => { if (dayOf[t] === day) sum += Math.max(0, bilinear(g, g.rain, t * N, lat, lon)); });
        if (sum > best) { best = sum; at = [lon, lat]; }
      }
      levels.push(levelOf(best)); peakMm.push(Math.round(best)); peakAt.push(at);
    }
    if (levels.every((l) => l === 0)) return;
    const mid = verts[Math.floor(verts.length / 2)];
    out.push({
      id, name: w.name, nameAr: w.nameAr, km: w.km, gov: governorateOf(mid[1], mid[0]), levels, peakMm, peakAt, lines: w.lines,
      crossings: DATA.crossings.filter((c) => c[2] === id).map(([lon, lat, , ford]) => [lon, lat, ford] as [number, number, number]),
    });
  });
  out.sort((a, b) => Math.max(...b.levels) - Math.max(...a.levels) || Math.max(...b.peakMm) - Math.max(...a.peakMm));
  return { days, wadis: out };
}

export const getWadiRisk = unstable_cache(async () => computeWadiRisk(await getForecastGrid()), ["observatory-wadis-v1"], { revalidate: 1800 });
