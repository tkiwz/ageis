import { describe, it, expect, vi, beforeEach } from "vitest";
import { GRID, NX, NY, type ForecastGrid } from "./grid";

// A 7-day grid that is calm everywhere except one windy afternoon around Fahud.
const FAHUD = { lat: 22.32, lon: 56.44 };
function syntheticGrid(): ForecastGrid {
  const start = Date.UTC(2026, 9, 27, 0);
  const times = Array.from({ length: 56 }, (_, t) => new Date(start + t * 3 * 3600_000).toISOString());
  const N = NX * NY, T = times.length;
  const z = () => new Array<number>(T * N).fill(0);
  const g: ForecastGrid = {
    generatedAt: new Date(start).toISOString(), grid: { ...GRID, nx: NX, ny: NY }, times,
    temp: z().map(() => 30), rain: z(), wind: z(), dir: z(), gust: z().map(() => 20), cloud: z(), code: z(),
  };
  const j = Math.round((FAHUD.lat - GRID.lat0) / GRID.step), i = Math.round((FAHUD.lon - GRID.lon0) / GRID.step);
  for (const t of [11, 12]) g.gust[t * N + j * NX + i] = 66; // 09:00–15:00 UTC on day 2 → orange
  return g;
}

vi.mock("./grid", async (orig) => ({ ...(await orig<typeof import("./grid")>()), getForecastGrid: vi.fn(async () => syntheticGrid()) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const permits = [
  { id: "p1", permitNumber: "PTW-1", title: "Crane lift", type: "LIFTING", status: "APPROVED", siteId: "fhd", validFrom: new Date(Date.UTC(2026, 9, 28, 6)), validUntil: new Date(Date.UTC(2026, 9, 28, 18)) },
  { id: "p2", permitNumber: "PTW-2", title: "Weld", type: "HOT_WORK", status: "ACTIVE", siteId: "fhd", validFrom: new Date(Date.UTC(2026, 9, 28, 6)), validUntil: new Date(Date.UTC(2026, 9, 28, 18)) },
  { id: "p3", permitNumber: "PTW-3", title: "Lift next week", type: "LIFTING", status: "APPROVED", siteId: "fhd", validFrom: new Date(Date.UTC(2026, 10, 2, 6)), validUntil: new Date(Date.UTC(2026, 10, 2, 18)) },
];
const alerts: { title: string }[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    site: { findMany: vi.fn(async () => [
      { id: "fhd", code: "FHD-001", name: "Fahud", nameAr: "فهود", latitude: FAHUD.lat, longitude: FAHUD.lon },
      { id: "sll", code: "AML-001", name: "Amal", nameAr: "أمل", latitude: 18.33, longitude: 55.69 },
    ]) },
    permit: { findMany: vi.fn(async () => permits) },
    alert: {
      findFirst: vi.fn(async ({ where }: { where: { title: string } }) => alerts.find((a) => a.title === where.title) ?? null),
      create: vi.fn(async ({ data }: { data: { title: string } }) => { alerts.push(data); return data; }),
    },
  },
}));

describe("site early warnings", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 6))); alerts.length = 0; });

  it("matches a windy governorate to its site and flags only the exposed, overlapping permits", async () => {
    const { getSiteWarnings } = await import("./site-warnings");
    const { sites } = await getSiteWarnings("*");
    expect(sites.map((s) => s.site.code)).toEqual(["FHD-001"]);
    const wind = sites[0].warnings.find((w) => w.hazard === "WIND")!;
    expect(wind.level).toBe(2);
    expect(wind.permits.map((p) => p.permitNumber)).toEqual(["PTW-1"]); // not the weld, not next week's lift
  });

  it("raises one dashboard alert per warning and doesn't repeat it", async () => {
    const { syncForecastAlerts } = await import("./site-warnings");
    await syncForecastAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain("رياح قوية");
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 7))); // past the 30-minute throttle
    await syncForecastAlerts();
    expect(alerts).toHaveLength(1);
  });
});
