/**
 * Active tropical cyclones around the Arabian Sea / North Indian Ocean from
 * GDACS (European Commission JRC; tracks from JTWC). Cached 30 minutes.
 */
import { unstable_cache } from "next/cache";
import { FEATURES } from "./warnings";

const REGION = { lon0: 30, lon1: 100, lat0: -10, lat1: 35 };
const UA = { "User-Agent": "AEGIS-observatory/1.0" };

export type Category = "TD" | "TS" | "HU";
export interface CyclonePoint { lat: number; lon: number; time: string; forecast: boolean }
export interface ActiveCyclone {
  id: number;
  name: string;
  alert: "Green" | "Orange" | "Red" | string;
  country: string | null;
  updated: string;
  /** Track segments with the storm's category on each */
  track: { cat: Category; coords: [number, number][] }[];
  points: CyclonePoint[];
  /** Forecast uncertainty cone (lon/lat rings) */
  cone: [number, number][][] | null;
  /** Areas with winds above 60 / 90 / 120 km/h over the whole forecast */
  windZones: { kmh: 60 | 90 | 120; rings: [number, number][][] }[];
  /** Closest distance from the track or cone to Oman's land, km */
  closestKm: number;
}

type Geo = { type: string; coordinates: unknown };
interface Feature { geometry: Geo; properties: Record<string, unknown> }

const OMAN_VERTS: [number, number][] = FEATURES.flatMap((f) =>
  (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap((p) => p[0] as [number, number][]),
).filter((_, k) => k % 3 === 0);

export function kmBetween([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
export function kmToOman(pts: [number, number][]) {
  let best = Infinity;
  for (const p of pts) for (const v of OMAN_VERTS) best = Math.min(best, kmBetween(p, v));
  return Math.round(best);
}

const ringsOf = (g: Geo): [number, number][][] =>
  g.type === "Polygon" ? (g.coordinates as [number, number][][]) : g.type === "MultiPolygon" ? (g.coordinates as [number, number][][][]).flat() : [];
const round = (rings: [number, number][][]) => rings.map((r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number]));

/** "26/10 18:00 UTC" with the event's year → ISO */
function labelTime(label: string, year: number): string | null {
  const m = label.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  return m ? new Date(Date.UTC(year, +m[2] - 1, +m[1], +m[3], +m[4])).toISOString() : null;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`gdacs ${r.status}`);
  return r.json() as Promise<T>;
}

async function fetchActive(): Promise<ActiveCyclone[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const list = await getJson<{ features?: Feature[] }>(
    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromDate=${day(new Date(now.getTime() - 10 * 864e5))}&toDate=${day(now)}`,
  ).catch(() => ({ features: [] }));

  const current = (list.features ?? []).filter((f) => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates as [number, number];
    return String(p.iscurrent) === "true" && lon >= REGION.lon0 && lon <= REGION.lon1 && lat >= REGION.lat0 && lat <= REGION.lat1;
  });

  const out: ActiveCyclone[] = [];
  for (const ev of current) {
    const p = ev.properties;
    const geo = await getJson<{ features: Feature[] }>(String((p.url as Record<string, string>).geometry)).catch(() => null);
    if (!geo) continue;
    const year = new Date(String(p.fromdate)).getUTCFullYear();
    const track = geo.features
      .filter((f) => f.geometry.type === "LineString" && String(f.properties.Class).startsWith("Line_Line"))
      .sort((a, b) => Number(String(a.properties.Class).split("_").pop()) - Number(String(b.properties.Class).split("_").pop()))
      .map((f) => ({
        cat: (["TD", "TS"].includes(String(f.properties.polygonlabel)) ? f.properties.polygonlabel : "HU") as Category,
        coords: (f.geometry.coordinates as [number, number][]).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number]),
      }));
    const points = geo.features
      .filter((f) => String(f.properties.Class).startsWith("Point_Polygon_Point"))
      .map((f) => {
        const ring = ringsOf(f.geometry)[0] ?? [];
        const lon = ring.reduce((s, c) => s + c[0], 0) / Math.max(1, ring.length), lat = ring.reduce((s, c) => s + c[1], 0) / Math.max(1, ring.length);
        const time = labelTime(String(f.properties.polygonlabel), year);
        return time ? { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, time, forecast: Date.parse(time) > now.getTime() } : null;
      })
      .filter((x): x is CyclonePoint => !!x)
      .sort((a, b) => a.time.localeCompare(b.time));
    const coneF = geo.features.find((f) => f.properties.Class === "Poly_Cones");
    const zones = (["60 km/h", "90 km/h", "120 km/h"] as const).flatMap((label) => {
      const f = geo.features.find((x) => x.properties.polygonlabel === label);
      return f ? [{ kmh: Number(label.split(" ")[0]) as 60 | 90 | 120, rings: round(ringsOf(f.geometry)) }] : [];
    });
    const cone = coneF ? round(ringsOf(coneF.geometry)) : null;
    const allPts: [number, number][] = [...track.flatMap((s) => s.coords), ...(cone?.flat() ?? [])];
    out.push({
      id: Number(p.eventid),
      name: String(p.eventname ?? p.name),
      alert: String(p.alertlevel),
      country: p.country ? String(p.country) : null,
      updated: String(p.datemodified ?? p.todate),
      track, points, cone, windZones: zones,
      closestKm: allPts.length ? kmToOman(allPts) : 99999,
    });
  }
  return out.sort((a, b) => a.closestKm - b.closestKm);
}

export const getActiveCyclones = unstable_cache(fetchActive, ["observatory-cyclones-v1"], { revalidate: 1800 });
