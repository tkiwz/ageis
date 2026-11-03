import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./grid", async (orig) => ({ ...(await orig<typeof import("./grid")>()), getForecastGrid: vi.fn() }));
import { GRID, NX, NY, type ForecastGrid } from "./grid";
import { computeWadiRisk } from "./wadi-risk";
import wadis from "./wadis.json";

function grid(): ForecastGrid {
  const T = 16, N = NX * NY, z = () => new Array<number>(T * N).fill(0);
  return {
    generatedAt: "", grid: { ...GRID, nx: NX, ny: NY },
    times: Array.from({ length: T }, (_, t) => new Date(Date.UTC(2026, 10, 3) + t * 3 * 3600_000).toISOString()),
    temp: z(), rain: z(), wind: z(), dir: z(), gust: z(), cloud: z(), code: z(), dust: z(), rainAgree: z(), rainModels: [],
  };
}

describe("wadi flood risk", () => {
  it("is quiet when it is dry", () => {
    expect(computeWadiRisk(grid()).wadis).toHaveLength(0);
  });

  it("flags a wadi when heavy rain falls up its course, with its road crossings", () => {
    const g = grid();
    const w = (wadis as unknown as { wadis: { lines: [number, number][][]; nameAr: string }[] }).wadis[0];
    const [lon, lat] = w.lines[0][0];
    const i = Math.round((lon - GRID.lon0) / GRID.step), j = Math.round((lat - GRID.lat0) / GRID.step);
    for (const t of [3, 4, 5]) for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) g.rain[t * NX * NY + (j + dj) * NX + (i + di)] = 15;
    const r = computeWadiRisk(g);
    const hit = r.wadis.find((x) => x.nameAr === w.nameAr)!;
    expect(hit).toBeTruthy();
    expect(Math.max(...hit.levels)).toBe(3);   // 45 mm in a day → dangerous
    expect(Math.max(...hit.peakMm)).toBeGreaterThanOrEqual(40);
  });
});
