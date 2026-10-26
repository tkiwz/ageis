/**
 * Geographic helpers for the pipeline 3D view:
 *  - local projection (lat/lng ⇄ scene units) shared by the route and the ground
 *  - Web-Mercator tile maths
 *  - loading satellite imagery (Esri World Imagery) and elevation
 *    (AWS Terrain Tiles, "terrarium" encoding) as CORS images
 *
 * Both tile sources are public, need no key, and send Access-Control-Allow-Origin: *.
 */

export const IMAGERY_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const ELEVATION_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const KM_PER_DEG_LAT = 110.57;

/** Equirectangular projection around a centre, scaled to scene units. */
export interface Projection {
  lat0: number;
  lng0: number;
  /** Scene units per km. */
  unitsPerKm: number;
  /** km offset of the scene origin in the local plane. */
  midX: number;
  midZ: number;
  toScene: (lat: number, lng: number) => { x: number; z: number };
  toLatLng: (x: number, z: number) => { lat: number; lng: number };
}

export function makeProjection(lat0: number, lng0: number, unitsPerKm: number, midX: number, midZ: number): Projection {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return {
    lat0, lng0, unitsPerKm, midX, midZ,
    toScene: (lat, lng) => ({
      x: ((lng - lng0) * kx - midX) * unitsPerKm,
      z: (-(lat - lat0) * KM_PER_DEG_LAT - midZ) * unitsPerKm,
    }),
    toLatLng: (x, z) => ({
      lng: lng0 + (x / unitsPerKm + midX) / kx,
      lat: lat0 - (z / unitsPerKm + midZ) / KM_PER_DEG_LAT,
    }),
  };
}

// ── Web Mercator tiles ──────────────────────────────────────
export const lngToTileX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
export const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tileXToLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
export const tileYToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export interface BBox { minLat: number; maxLat: number; minLng: number; maxLng: number }

export interface TileRange { z: number; x0: number; x1: number; y0: number; y1: number }

/** Highest zoom at which the box fits in at most `maxTiles` tiles. */
export function pickTiles(b: BBox, maxTiles: number, maxZoom: number, minZoom = 5): TileRange {
  for (let z = maxZoom; z >= minZoom; z--) {
    const x0 = Math.floor(lngToTileX(b.minLng, z)), x1 = Math.floor(lngToTileX(b.maxLng, z));
    const y0 = Math.floor(latToTileY(b.maxLat, z)), y1 = Math.floor(latToTileY(b.minLat, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles) return { z, x0, x1, y0, y1 };
  }
  const z = minZoom;
  return {
    z,
    x0: Math.floor(lngToTileX(b.minLng, z)), x1: Math.floor(lngToTileX(b.maxLng, z)),
    y0: Math.floor(latToTileY(b.maxLat, z)), y1: Math.floor(latToTileY(b.minLat, z)),
  };
}

export function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = () => { signal?.removeEventListener("abort", onAbort); };
    const onAbort = () => { img.src = ""; reject(new DOMException("aborted", "AbortError")); };
    signal?.addEventListener("abort", onAbort);
    img.onload = () => { done(); resolve(img); };
    img.onerror = () => { done(); reject(new Error(`tile failed: ${url}`)); };
    img.src = url;
  });
}

/** Elevation in metres for any lat/lng inside the loaded tiles (bilinear). */
export interface ElevationSampler {
  at: (lat: number, lng: number) => number;
  min: number;
  max: number;
}

export async function loadElevation(range: TileRange, signal?: AbortSignal): Promise<ElevationSampler> {
  const { z, x0, x1, y0, y1 } = range;
  const W = 256;
  const tiles = new Map<string, Float32Array>();
  let min = Infinity, max = -Infinity;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = W;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");

  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push(loadImage(ELEVATION_URL(z, x, y), signal).then((img) => {
      ctx.clearRect(0, 0, W, W);
      ctx.drawImage(img, 0, 0, W, W);
      const px = ctx.getImageData(0, 0, W, W).data;
      const h = new Float32Array(W * W);
      for (let i = 0; i < W * W; i++) {
        const v = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
        h[i] = v < -500 ? 0 : v;          // sea / no-data → sea level
        if (h[i] < min) min = h[i];
        if (h[i] > max) max = h[i];
      }
      tiles.set(`${x}/${y}`, h);
    }));
  }
  await Promise.all(jobs);

  const sample = (tx: number, ty: number) => {
    const ix = Math.floor(tx), iy = Math.floor(ty);
    const h = tiles.get(`${ix}/${iy}`);
    if (!h) return min === Infinity ? 0 : min;
    const px = Math.min(W - 1, Math.max(0, (tx - ix) * W));
    const py = Math.min(W - 1, Math.max(0, (ty - iy) * W));
    const ax = Math.floor(px), ay = Math.floor(py);
    const bx = Math.min(W - 1, ax + 1), by = Math.min(W - 1, ay + 1);
    const fx = px - ax, fy = py - ay;
    const v00 = h[ay * W + ax], v10 = h[ay * W + bx], v01 = h[by * W + ax], v11 = h[by * W + bx];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };

  return {
    at: (lat, lng) => sample(lngToTileX(lng, z), latToTileY(lat, z)),
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
  };
}
