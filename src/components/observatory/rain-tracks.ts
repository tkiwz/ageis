/**
 * Rain cells and their paths, from the forecast grid.
 *
 * Every 3-hour step, neighbouring grid points with rain are grouped into a
 * "cell". A cell continues the cell of the previous step that it overlaps (or
 * sits close to); otherwise it is a new cell — that is where rain starts to form.
 * Following the rain-weighted centre of a cell step by step gives its path.
 */
import type { ForecastGrid } from "@/lib/observatory/grid";

export const RAIN_MM = 0.5;   // mm in 3 h that counts as raining
const LINK_DEG = 1.0;         // max centre jump between steps without overlap (~110 km)

export interface CellStep { t: number; lat: number; lon: number; maxMm: number; totalMm: number; points: number; /** most models agreeing at any point of the cell */ agree: number }
export interface RainTrack {
  id: number;
  steps: CellStep[];
  /** true when the cell already exists at the first forecast step (its start is not in the forecast) */
  existing: boolean;
  peakMm: number;
  /** Bearing of travel from first to last centre, degrees clockwise from north (null if it barely moves) */
  bearing: number | null;
  /** Share of the blended models that expect this cell, averaged over its life (0..1) */
  confidence: number;
}

interface Cell { pts: number[]; lat: number; lon: number; maxMm: number; totalMm: number; agree: number }

function cellsAt(g: ForecastGrid, t: number): Cell[] {
  const { nx, ny, lat0, lon0, step } = g.grid;
  const N = nx * ny, base = t * N;
  const seen = new Uint8Array(N);
  const out: Cell[] = [];
  for (let n = 0; n < N; n++) {
    if (seen[n] || g.rain[base + n] < RAIN_MM) continue;
    const pts: number[] = [];
    const stack = [n];
    seen[n] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      pts.push(k);
      const i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const m = jj * nx + ii;
        if (!seen[m] && g.rain[base + m] >= RAIN_MM) { seen[m] = 1; stack.push(m); }
      }
    }
    let w = 0, la = 0, lo = 0, max = 0;
    for (const k of pts) {
      const r = g.rain[base + k];
      w += r; max = Math.max(max, r);
      la += r * (lat0 + ((k / nx) | 0) * step);
      lo += r * (lon0 + (k % nx) * step);
    }
    const agree = Math.max(...pts.map((k) => g.rainAgree?.[base + k] ?? 1));
    out.push({ pts, lat: la / w, lon: lo / w, maxMm: max, totalMm: w, agree });
  }
  return out;
}

export function rainTracks(g: ForecastGrid): RainTrack[] {
  const tracks: (RainTrack & { lastPts: Set<number> })[] = [];
  let open: (RainTrack & { lastPts: Set<number> })[] = [];
  let nextId = 1;

  for (let t = 0; t < g.times.length; t++) {
    const cells = cellsAt(g, t).sort((a, b) => b.totalMm - a.totalMm); // big cells claim their track first
    const claimed = new Set<number>();
    const nowOpen: typeof open = [];
    for (const c of cells) {
      // Best continuation: most overlapping points, else nearest centre within LINK_DEG
      let best: (typeof open)[number] | null = null, bestScore = 0;
      for (const tr of open) {
        if (claimed.has(tr.id)) continue;
        const overlap = c.pts.filter((p) => tr.lastPts.has(p)).length;
        const last = tr.steps[tr.steps.length - 1];
        const d = Math.hypot(c.lat - last.lat, c.lon - last.lon);
        const score = overlap > 0 ? 10 + overlap : d <= LINK_DEG ? 1 - d / LINK_DEG : 0;
        if (score > bestScore) { bestScore = score; best = tr; }
      }
      const cs: CellStep = { t, lat: c.lat, lon: c.lon, maxMm: c.maxMm, totalMm: c.totalMm, points: c.pts.length, agree: c.agree };
      if (best) {
        claimed.add(best.id);
        best.steps.push(cs);
        best.lastPts = new Set(c.pts);
        best.peakMm = Math.max(best.peakMm, c.maxMm);
        nowOpen.push(best);
      } else {
        const tr = { id: nextId++, steps: [cs], existing: t === 0, peakMm: c.maxMm, bearing: null, confidence: 0, lastPts: new Set(c.pts) };
        tracks.push(tr);
        nowOpen.push(tr);
      }
    }
    open = nowOpen; // a track that found no cell this step has ended
  }

  return tracks
    // Ignore one-point flickers: keep cells that last or that really rain
    .filter((tr) => tr.steps.length >= 2 || tr.peakMm >= 2)
    .map(({ lastPts: _drop, ...tr }) => {
      const a = tr.steps[0], b = tr.steps[tr.steps.length - 1];
      const dy = b.lat - a.lat, dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
      const bearing = Math.hypot(dx, dy) < 0.25 ? null : ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const n = Math.max(1, g.rainModels?.length ?? 1);
      const confidence = tr.steps.reduce((s, st) => s + st.agree, 0) / tr.steps.length / n;
      return { ...tr, bearing, confidence: Math.min(1, confidence) };
    });
}

/** Eight-way direction key for a bearing (translated in observatory.dir.*). */
export function directionKey(bearing: number): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" {
  return (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[Math.round(bearing / 45) % 8];
}
