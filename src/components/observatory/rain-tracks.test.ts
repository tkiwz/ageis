import { describe, it, expect } from "vitest";
import { GRID, NX, NY, type ForecastGrid } from "@/lib/observatory/grid";
import { directionKey, rainTracks } from "./rain-tracks";

function emptyGrid(steps: number): ForecastGrid {
  const N = NX * NY, T = steps;
  const z = () => new Array<number>(T * N).fill(0);
  return {
    generatedAt: "", grid: { ...GRID, nx: NX, ny: NY },
    times: Array.from({ length: T }, (_, t) => new Date(Date.UTC(2026, 9, 27) + t * 3 * 3600_000).toISOString()),
    temp: z(), rain: z(), wind: z(), dir: z(), gust: z(), cloud: z(), code: z(), dust: z(),
  };
}
const idx = (lat: number, lon: number) => Math.round((lat - GRID.lat0) / GRID.step) * NX + Math.round((lon - GRID.lon0) / GRID.step);
function rainAt(g: ForecastGrid, t: number, lat: number, lon: number, mm: number) {
  g.rain[t * NX * NY + idx(lat, lon)] = mm;
}

describe("rain tracks", () => {
  it("finds where a cell forms and follows it as it moves north-east", () => {
    const g = emptyGrid(6);
    // Forms over the Hajar at step 2, then drifts NE one grid step each 3 h
    rainAt(g, 2, 22.5, 57.0, 3); rainAt(g, 2, 22.5, 57.5, 1);
    rainAt(g, 3, 23.0, 57.5, 5); rainAt(g, 3, 23.0, 58.0, 2);
    rainAt(g, 4, 23.5, 58.0, 4);
    const [tr] = rainTracks(g);
    expect(tr.existing).toBe(false);
    expect(tr.steps.map((s) => s.t)).toEqual([2, 3, 4]);
    expect(tr.peakMm).toBe(5);
    expect(directionKey(tr.bearing!)).toBe("NE");
  });

  it("keeps two separate cells apart and drops one-step drizzle", () => {
    const g = emptyGrid(4);
    rainAt(g, 0, 17.0, 54.0, 3); rainAt(g, 1, 17.0, 54.5, 3); // Dhofar, already raining at the start
    rainAt(g, 1, 24.0, 56.5, 0.6);                             // a single weak blip in Batinah
    const tracks = rainTracks(g);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].existing).toBe(true);
  });
});
