/**
 * Pure helpers for drawing the forecast grid: sampling, calm colour ramps, and
 * rendering one time step into a Mercator-spaced canvas that Leaflet can stretch
 * over the grid bounds without distortion.
 */
import type { ForecastGrid } from "@/lib/observatory/grid";
import governorates from "@/lib/observatory/oman-governorates.json";

export type LayerId = "temp" | "rain" | "wind" | "cloud";
export type RGBA = [number, number, number, number];

interface Stop { v: number; c: RGBA }
const hex = (h: string, a = 1): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

/**
 * Muted, perceptually even ramps — readable at a glance, easy on the eyes on
 * both themes. Alpha is part of the ramp so dry / clear areas stay transparent.
 */
export const RAMPS: Record<LayerId, Stop[]> = {
  temp: [
    { v: 10, c: hex("#3b5b92", 0.62) }, { v: 18, c: hex("#3f8f9f", 0.62) }, { v: 24, c: hex("#7fb69a", 0.6) },
    { v: 30, c: hex("#d9c98a", 0.6) }, { v: 36, c: hex("#dc9b5b", 0.62) }, { v: 42, c: hex("#c96a48", 0.66) },
    { v: 48, c: hex("#a33f3f", 0.7) },
  ],
  rain: [
    { v: 0.1, c: hex("#9cc9e8", 0) }, { v: 0.3, c: hex("#9cc9e8", 0.4) }, { v: 1, c: hex("#5aa1d6", 0.6) },
    { v: 5, c: hex("#2f6fbf", 0.72) }, { v: 15, c: hex("#5a46a8", 0.8) }, { v: 30, c: hex("#8a3fa0", 0.86) },
  ],
  wind: [
    { v: 0, c: hex("#2b4a6f", 0.5) }, { v: 10, c: hex("#3f7f8f", 0.5) }, { v: 20, c: hex("#6fae8f", 0.52) },
    { v: 30, c: hex("#cbbf72", 0.56) }, { v: 45, c: hex("#d48a4f", 0.62) }, { v: 60, c: hex("#b9504a", 0.68) },
  ],
  cloud: [
    { v: 5, c: hex("#dfe3ea", 0) }, { v: 30, c: hex("#dfe3ea", 0.25) }, { v: 70, c: hex("#e9ecf1", 0.5) }, { v: 100, c: hex("#f4f5f8", 0.7) },
  ],
};

/** Legend ticks per layer (also the domain shown in the gradient bar). */
export const LEGEND: Record<LayerId, number[]> = {
  temp: [10, 20, 30, 40, 48],
  rain: [0.3, 1, 5, 15, 30],
  wind: [0, 15, 30, 45, 60],
  cloud: [0, 25, 50, 75, 100],
};

export function colorAt(layer: LayerId, v: number, dark: boolean): RGBA {
  const stops = RAMPS[layer];
  let c: RGBA;
  if (v <= stops[0].v) c = stops[0].c;
  else if (v >= stops[stops.length - 1].v) c = stops[stops.length - 1].c;
  else {
    const k = stops.findIndex((s) => s.v > v);
    const a = stops[k - 1], b = stops[k], f = (v - a.v) / (b.v - a.v);
    c = [0, 1, 2, 3].map((i) => a.c[i] + (b.c[i] - a.c[i]) * f) as RGBA;
  }
  // Clouds read as grey on a light basemap
  if (layer === "cloud" && !dark) return [92, 102, 120, c[3] * 0.9];
  return c;
}

/** Values of one variable at one step, plus wind u/v (km/h, towards east / north). */
export interface Frame { values: Float32Array; u: Float32Array; v: Float32Array }

export function frameOf(g: ForecastGrid, layer: LayerId, t: number): Frame {
  const N = g.grid.nx * g.grid.ny, base = t * N;
  const src = layer === "temp" ? g.temp : layer === "rain" ? g.rain : layer === "cloud" ? g.cloud : g.wind;
  const values = new Float32Array(N), u = new Float32Array(N), v = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    values[n] = src[base + n];
    const s = g.wind[base + n], d = (g.dir[base + n] * Math.PI) / 180; // direction it blows FROM
    u[n] = -s * Math.sin(d);
    v[n] = -s * Math.cos(d);
  }
  return { values, u, v };
}

/** Bilinear sample at a lat/lon; null outside the grid. */
export function sample(g: ForecastGrid, arr: Float32Array, lat: number, lon: number): number | null {
  const { lat0, lon0, step, nx, ny } = g.grid;
  const fx = (lon - lon0) / step, fy = (lat - lat0) / step;
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy));
  const dx = fx - i, dy = fy - j, n = j * nx + i;
  return (arr[n] * (1 - dx) + arr[n + 1] * dx) * (1 - dy) + (arr[n + nx] * (1 - dx) + arr[n + nx + 1] * dx) * dy;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Canvas geometry for the grid bounds: equal steps in Mercator y, so it overlays exactly. */
export function canvasGeometry(g: ForecastGrid, width = 360) {
  const { lat0, lat1, lon0, lon1 } = g.grid;
  const y0 = mercY(lat0), y1 = mercY(lat1);
  const height = Math.round((width * (y1 - y0)) / (((lon1 - lon0) * Math.PI) / 180));
  return {
    width, height,
    latOfRow: (r: number) => (360 / Math.PI) * Math.atan(Math.exp(y1 - ((r + 0.5) / height) * (y1 - y0))) - 90,
    lonOfCol: (c: number) => lon0 + ((c + 0.5) / width) * (lon1 - lon0),
    toPx: (lon: number, lat: number): [number, number] => [((lon - lon0) / (lon1 - lon0)) * width, ((y1 - mercY(lat)) / (y1 - y0)) * height],
  };
}

type Ring = number[][];
export type Polygons = Ring[][]; // list of polygons, each [outer, ...holes]

/** Draws a frame into `canvas`, clipped to Oman's land so the sea stays calm and readable. */
export function renderFrame(canvas: HTMLCanvasElement, g: ForecastGrid, layer: LayerId, frame: Frame, land: Polygons, dark: boolean) {
  const geo = canvasGeometry(g);
  canvas.width = geo.width;
  canvas.height = geo.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(geo.width, geo.height);
  const field = layer === "wind" ? null : frame.values;
  for (let r = 0; r < geo.height; r++) {
    const lat = geo.latOfRow(r);
    for (let c = 0; c < geo.width; c++) {
      const lon = geo.lonOfCol(c);
      let val: number | null;
      if (field) val = sample(g, field, lat, lon);
      else {
        const u = sample(g, frame.u, lat, lon), v = sample(g, frame.v, lat, lon);
        val = u === null || v === null ? null : Math.hypot(u, v);
      }
      if (val === null) continue;
      const [R, G, B, A] = colorAt(layer, val, dark);
      const k = (r * geo.width + c) * 4;
      img.data[k] = R; img.data[k + 1] = G; img.data[k + 2] = B; img.data[k + 3] = Math.round(A * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Keep only the land
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  for (const poly of land) for (const ring of poly) {
    ring.forEach(([lon, lat], i) => { const [x, y] = geo.toPx(lon, lat); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
  }
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  ctx.globalCompositeOperation = "source-over";
}

/** 1 where the grid canvas covers Oman's land, so moving streaks can stay over land. */
export function landMask(g: ForecastGrid, land: Polygons) {
  const geo = canvasGeometry(g);
  const c = document.createElement("canvas");
  c.width = geo.width; c.height = geo.height;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  for (const poly of land) for (const ring of poly) {
    ring.forEach(([lon, lat], i) => { const [x, y] = geo.toPx(lon, lat); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
  }
  ctx.fill("evenodd");
  const alpha = ctx.getImageData(0, 0, geo.width, geo.height).data;
  return (lon: number, lat: number) => {
    const [x, y] = geo.toPx(lon, lat);
    if (x < 0 || y < 0 || x >= geo.width || y >= geo.height) return false;
    return alpha[((y | 0) * geo.width + (x | 0)) * 4 + 3] > 0;
  };
}

/** CSS gradient for the legend bar; ticks are evenly spaced (rain is not linear). */
export function legendGradient(layer: LayerId, dark: boolean) {
  const ticks = LEGEND[layer];
  const seg = ticks.length - 1;
  const stops: string[] = [];
  for (let k = 0; k < seg; k++) {
    for (let s = 0; s <= 3; s++) {
      if (k > 0 && s === 0) continue;
      const v = ticks[k] + ((ticks[k + 1] - ticks[k]) * s) / 3;
      const [r, g, b, a] = colorAt(layer, v, dark);
      stops.push(`rgba(${r | 0},${g | 0},${b | 0},${Math.max(a, 0.2).toFixed(2)}) ${(((k + s / 3) / seg) * 100).toFixed(1)}%`);
    }
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// ── Governorates (client side) ──────────────────────────────
export interface GovInfo { iso: string; name: string; nameAr: string }
type GovGeom = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
export const GOV_FEATURES = (governorates as unknown as { features: { properties: GovInfo; geometry: GovGeom }[] }).features;

function inRing(lon: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const [xa, ya] = ring[a], [xb, yb] = ring[b];
    if (ya > lat !== yb > lat && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}
export function inGovernorate(g: GovGeom, lon: number, lat: number) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}
/** Governorate under a point, or null (sea / outside Oman). */
export function govAt(lat: number, lon: number): GovInfo | null {
  return GOV_FEATURES.find((f) => inGovernorate(f.geometry, lon, lat))?.properties ?? null;
}

// ── Town symbols (TV-style weather icons) ───────────────────
export type Symbol = "SUN" | "MOON" | "PARTLY" | "PARTLY_NIGHT" | "CLOUD" | "RAIN" | "HEAVY_RAIN" | "STORM" | "FOG";

/** What the sky looks like at a point and step, from the nearest grid values. */
export function pointWeather(g: ForecastGrid, t: number, lat: number, lon: number) {
  const { lat0, lon0, step, nx, ny } = g.grid;
  const i = Math.min(nx - 1, Math.max(0, Math.round((lon - lon0) / step)));
  const j = Math.min(ny - 1, Math.max(0, Math.round((lat - lat0) / step)));
  const n = t * nx * ny + j * nx + i;
  const hour = new Date(Date.parse(g.times[t]) + 4 * 3600_000).getUTCHours(); // Oman time
  const night = hour >= 18 || hour < 6;
  const code = g.code[n], rain = g.rain[n], cloud = g.cloud[n];
  let symbol: Symbol;
  if (code >= 95) symbol = "STORM";
  else if (rain >= 4) symbol = "HEAVY_RAIN";
  else if (rain >= 0.3 || (code >= 51 && code <= 82)) symbol = "RAIN";
  else if (code === 45 || code === 48) symbol = "FOG";
  else if (cloud >= 70) symbol = "CLOUD";
  else if (cloud >= 25) symbol = night ? "PARTLY_NIGHT" : "PARTLY";
  else symbol = night ? "MOON" : "SUN";
  return { symbol, temp: g.temp[n], rain, cloud, code };
}

/** Plain-language bands under each legend (keys in observatory.bands.<layer>). */
export const BANDS: Record<LayerId, number> = { temp: 4, rain: 4, wind: 4, cloud: 4 };
