/**
 * Earthquakes around Oman (Makran, Zagros, Gulf of Aden, Arabian Sea) from the
 * USGS real-time catalogue (public domain). Last 30 days, magnitude ≥ 2.5. Cached 10 min.
 */
import { unstable_cache } from "next/cache";

export interface Quake { id: string; mag: number; depthKm: number; lat: number; lon: number; time: string; place: string; tsunami: boolean }

async function fetchQuakes(): Promise<Quake[]> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const r = await fetch("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time"
    + `&minlatitude=5&maxlatitude=40&minlongitude=40&maxlongitude=75&minmagnitude=2.5&starttime=${since}`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`usgs ${r.status}`);
  const j = (await r.json()) as { features: { id: string; geometry: { coordinates: [number, number, number] }; properties: { mag: number; time: number; place: string; tsunami: number } }[] };
  return j.features.map((f) => ({
    id: f.id, mag: Math.round(f.properties.mag * 10) / 10, depthKm: Math.round(f.geometry.coordinates[2]),
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], time: new Date(f.properties.time).toISOString(),
    place: f.properties.place, tsunami: f.properties.tsunami === 1,
  }));
}

export const getQuakes = unstable_cache(fetchQuakes, ["observatory-quakes-v1"], { revalidate: 600 });
