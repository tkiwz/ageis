/**
 * Significant wave height around Oman, 7 days, from NOAA WaveWatch III
 * (served by PacIOOS ERDDAP; US public domain). 0.5° grid, 3-hour steps
 * aligned with the forecast grid. Cached 3 hours.
 */
import { unstable_cache } from "next/cache";

export const SEA = { lat0: 14, lat1: 27, lon0: 50, lon1: 67, step: 0.5 } as const;
const NX = Math.round((SEA.lon1 - SEA.lon0) / SEA.step) + 1, NY = Math.round((SEA.lat1 - SEA.lat0) / SEA.step) + 1;

export interface WaveGrid {
  grid: typeof SEA & { nx: number; ny: number };
  times: string[];
  /** metres, [t * ny * nx + j * nx + i] (j from lat0); -1 over land */
  hs: number[];
}

async function fetchWaves(): Promise<WaveGrid> {
  const start = new Date(Math.floor(Date.now() / 864e5) * 864e5).toISOString().slice(0, 19) + "Z";
  const q = `Thgt%5B(${start}):3:(last)%5D%5B(0.0)%5D%5B(${SEA.lat0}):1:(${SEA.lat1})%5D%5B(${SEA.lon0}):1:(${SEA.lon1})%5D`;
  const r = await fetch(`https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_global.json?${q}`, {
    cache: "no-store", signal: AbortSignal.timeout(55_000),
  });
  if (!r.ok) throw new Error(`erddap ${r.status}`);
  const rows = ((await r.json()) as { table: { rows: [string, number, number, number, number | null][] } }).table.rows;
  const times = [...new Set(rows.map((x) => x[0]))].sort();
  const ti = new Map(times.map((t, k) => [t, k]));
  const hs = new Array<number>(times.length * NX * NY).fill(-1);
  for (const [t, , lat, lon, v] of rows) {
    if (v === null) continue;
    const i = Math.round((lon - SEA.lon0) / SEA.step), j = Math.round((lat - SEA.lat0) / SEA.step);
    if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
    hs[ti.get(t)! * NX * NY + j * NX + i] = Math.round(v * 10) / 10;
  }
  return { grid: { ...SEA, nx: NX, ny: NY }, times, hs }; // "YYYY-MM-DDTHH:00:00Z", same as the forecast grid
}

export const getWaves = unstable_cache(fetchWaves, ["observatory-waves-v1"], { revalidate: 3 * 3600 });
