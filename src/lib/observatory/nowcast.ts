/**
 * Storms forming now, from Meteosat infrared (EUMETSAT, IODC, every 15 min).
 *
 * A thunderstorm starts as a cloud whose top climbs fast, so it cools fast.
 * Two IR 10.8 µm pictures 30 minutes apart are compared pixel by pixel; tops
 * that are already cold and cooled sharply are grouped into cells. This shows
 * new storms 1–3 hours before they rain — usually before the models do.
 *
 * The WMS picture is grey (white = cold). Temperatures use a linear grey scale
 * (≈ +40 °C black … −80 °C white), so they are estimates, good for trends.
 */
import sharp from "sharp";
import { unstable_cache } from "next/cache";

const WMS = "https://view.eumetsat.int/geoserver/wms";
const BOX = { lon0: 51, lon1: 60.5, lat0: 16, lat1: 27 };
const W = 190, H = 220; // ≈ 0.05° per pixel (~5.5 km)
const STEP_MIN = 30;

/** grey 0..255 → approximate cloud-top temperature, °C */
export const greyToC = (g: number) => 40 - (g / 255) * 120;

const COLD_C = -10;          // top already colder than this
const COOL_C = -8;           // and cooled at least this much in 30 min
const MIN_PIXELS = 6;        // ≈ 180 km²
const CLOUD_C = -5;          // edge of the cloud drawn around a forming core

export interface FormingCell {
  lat: number; lon: number;
  areaKm2: number;
  minTopC: number;
  /** cooling of the coldest tops, °C per 15 minutes (negative = cooling) */
  coolingPer15: number;
  strong: boolean;
  /** The real cloud: cloud-top °C per pixel over its bounding box (null = clear), and which pixels are the cooling core */
  shape: { lat0: number; lon0: number; lat1: number; lon1: number; w: number; h: number; temps: (number | null)[]; core: string };
}
export interface Nowcast { time: string; previous: string; cells: FormingCell[] }

async function grey(time: string): Promise<Uint8Array> {
  const url = `${WMS}?service=WMS&version=1.3.0&request=GetMap&layers=msg_iodc:ir108&styles=&format=image/png`
    + `&crs=EPSG:4326&bbox=${BOX.lat0},${BOX.lon0},${BOX.lat1},${BOX.lon1}&width=${W}&height=${H}&TIME=${time}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`eumetsat ${r.status}`);
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W || info.height !== H) throw new Error("eumetsat: unexpected size");
  return new Uint8Array(data);
}

/** Pure: find forming cells from two grey pictures (now, 30 min before). Exported for tests. */
export function findForming(now: Uint8Array, before: Uint8Array): FormingCell[] {
  const hit = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) {
    const cNow = greyToC(now[k]), d = cNow - greyToC(before[k]);
    if (cNow <= COLD_C && d <= COOL_C) hit[k] = 1;
  }
  const seen = new Uint8Array(W * H), cells: FormingCell[] = [];
  const dLon = (BOX.lon1 - BOX.lon0) / W, dLat = (BOX.lat1 - BOX.lat0) / H;
  for (let s = 0; s < W * H; s++) {
    if (!hit[s] || seen[s]) continue;
    const px: number[] = [], stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      px.push(k);
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, m = yy * W + xx;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && hit[m] && !seen[m]) { seen[m] = 1; stack.push(m); }
      }
    }
    if (px.length < MIN_PIXELS) continue;
    // Grow from the cooling core to the whole cold cloud it belongs to — that's the shape people see
    const inCloud = new Set(px), queue = [...px];
    while (queue.length && inCloud.size < 4000) {
      const k = queue.pop()!;
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, m = yy * W + xx;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && !inCloud.has(m) && greyToC(now[m]) <= CLOUD_C) { inCloud.add(m); queue.push(m); }
      }
    }
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (const k of inCloud) { const x = k % W, y = (k / W) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    const sw = bx1 - bx0 + 1, sh = by1 - by0 + 1, coreSet = new Set(px);
    const temps: (number | null)[] = [];
    let core = "";
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const k = y * W + x;
      temps.push(inCloud.has(k) ? Math.round(greyToC(now[k])) : null);
      core += coreSet.has(k) ? "1" : "0";
    }
    const shape = {
      lat0: BOX.lat1 - (by1 + 1) * dLat, lat1: BOX.lat1 - by0 * dLat,
      lon0: BOX.lon0 + bx0 * dLon, lon1: BOX.lon0 + (bx1 + 1) * dLon, w: sw, h: sh, temps, core,
    };
    let sx = 0, sy = 0, minC = 99, cool = 0;
    for (const k of px) {
      sx += k % W; sy += (k / W) | 0;
      const c = greyToC(now[k]);
      if (c < minC) minC = c;
      cool = Math.min(cool, c - greyToC(before[k]));
    }
    const lat = BOX.lat1 - ((sy / px.length) + 0.5) * dLat, lon = BOX.lon0 + ((sx / px.length) + 0.5) * dLon;
    const kmPx = 111 * dLat * 111 * dLon * Math.cos((lat * Math.PI) / 180);
    const per15 = (cool * 15) / STEP_MIN;
    cells.push({
      lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100,
      areaKm2: Math.round(px.length * kmPx), minTopC: Math.round(minC), coolingPer15: Math.round(per15),
      strong: minC <= -40 && per15 <= -8,
      shape,
    });
  }
  return cells.sort((a, b) => a.coolingPer15 - b.coolingPer15);
}

async function compute(): Promise<Nowcast> {
  // Images land ~30 min after their time; use a slot safely available
  const t = Math.floor((Date.now() - 35 * 60_000) / (15 * 60_000)) * 15 * 60_000;
  const time = new Date(t).toISOString(), previous = new Date(t - STEP_MIN * 60_000).toISOString();
  const [a, b] = await Promise.all([grey(time), grey(previous)]);
  return { time, previous, cells: findForming(a, b) };
}

export const getNowcast = unstable_cache(compute, ["observatory-nowcast-v2"], { revalidate: 600 });
