/**
 * A tropical cyclone drawn the way it looks from a satellite: thin outer cirrus,
 * spiral rain bands curling inward counter-clockwise (Northern Hemisphere),
 * a bright dense central overcast, and — only at cyclone strength — a clear
 * eye ringed by a bright eyewall. Drawn once per category into a canvas
 * (seeded noise, so it never flickers) and reused; the map only rotates it.
 */
export type Cat = "TD" | "TS" | "HU";

/** Cloud-shield radius in km by strength (typical Arabian Sea storms). */
export const SHIELD_KM: Record<Cat, number> = { TD: 160, TS: 260, HU: 340 };

const SIZE = 512;
const cache = new Map<string, string>();

function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Data URL of the cyclone image (square, transparent outside the shield). */
export function cycloneImage(cat: Cat): string {
  const hit = cache.get(cat);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const R = SIZE / 2, cx = R, cy = R;
  const rnd = prng(cat === "HU" ? 7 : cat === "TS" ? 11 : 13);
  // How organised the storm is: depressions are loose, cyclones tight and symmetric
  const org = cat === "HU" ? 1 : cat === "TS" ? 0.65 : 0.35;

  // 1. Outer cirrus haze, thin and uneven
  const haze = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
  haze.addColorStop(0, "rgba(255,255,255,0.55)");
  haze.addColorStop(0.55, "rgba(235,240,248,0.22)");
  haze.addColorStop(1, "rgba(235,240,248,0)");
  ctx.fillStyle = haze;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // 2. Spiral rain bands: logarithmic spirals r = r0·e^(kθ); drawn as many soft
  //    puffs so the edges break up like real convection. Counter-clockwise inward
  //    means radius shrinks as the angle increases counter-clockwise on screen.
  ctx.globalCompositeOperation = "lighter";
  const arms = cat === "HU" ? 4 : 3;
  const k = 0.32 - 0.1 * org; // tighter spiral when stronger
  for (let a = 0; a < arms; a++) {
    const phase = (a / arms) * Math.PI * 2 + rnd() * 0.6;
    for (let th = 0; th < Math.PI * 3.2; th += 0.018) {
      const r = R * 0.95 * Math.exp(-k * th);
      if (r < R * (cat === "HU" ? 0.12 : 0.08)) break;
      // screen y grows downward, so -angle turns the spiral counter-clockwise inward
      const ang = -(th + phase);
      const jitter = (1 - org * 0.6) * 0.14 * R * (rnd() - 0.5) * (r / R);
      const x = cx + Math.cos(ang) * (r + jitter), y = cy + Math.sin(ang) * (r + jitter);
      const width = (0.035 + 0.07 * (r / R)) * R * (0.6 + rnd() * 0.8);
      const alpha = (0.05 + 0.1 * (1 - r / R)) * (0.55 + rnd() * 0.6) * (0.7 + 0.3 * org);
      const g = ctx.createRadialGradient(x, y, 0, x, y, width);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, width, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 3. Dense central overcast: the bright core of deep cloud
  const cdoR = R * (0.22 + 0.12 * org);
  const cdo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cdoR);
  cdo.addColorStop(0, `rgba(255,255,255,${0.75 * org + 0.15})`);
  cdo.addColorStop(0.7, `rgba(250,252,255,${0.45 * org + 0.1})`);
  cdo.addColorStop(1, "rgba(250,252,255,0)");
  ctx.fillStyle = cdo;
  ctx.beginPath(); ctx.arc(cx, cy, cdoR, 0, Math.PI * 2); ctx.fill();

  // 4. Fine texture: speckled cloud tops so it doesn't look airbrushed
  for (let i = 0; i < 2600; i++) {
    const rr = R * Math.sqrt(rnd()) * 0.9, aa = rnd() * Math.PI * 2;
    const s = 1 + rnd() * 3.5;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.06 * (1 - rr / R)})`;
    ctx.fillRect(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, s, s);
  }
  ctx.globalCompositeOperation = "source-over";

  // 5. The eye (cyclone strength only): clear centre, bright eyewall, slight shadow
  if (cat === "HU") {
    const eye = R * 0.055;
    const wall = ctx.createRadialGradient(cx, cy, eye * 0.6, cx, cy, eye * 2.6);
    wall.addColorStop(0, "rgba(255,255,255,0)");
    wall.addColorStop(0.35, "rgba(255,255,255,0.95)");
    wall.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wall;
    ctx.beginPath(); ctx.arc(cx, cy, eye * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, eye);
    hole.addColorStop(0, "rgba(0,0,0,0.95)");
    hole.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hole;
    ctx.beginPath(); ctx.arc(cx, cy, eye, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  // Soft round edge
  ctx.globalCompositeOperation = "destination-in";
  const edge = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  edge.addColorStop(0, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const url = c.toDataURL("image/png");
  cache.set(cat, url);
  return url;
}

/** Pixel diameter of the cloud shield at the map's current zoom and latitude. */
export function shieldPx(cat: Cat, lat: number, zoom: number): number {
  const metresPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.round((SHIELD_KM[cat] * 2 * 1000) / metresPerPx);
}

/** HTML for a Leaflet divIcon: the cyclone image, slowly turning counter-clockwise. */
export function cycloneHtml(cat: Cat, px: number): string {
  return `<div class="obs-cyclone" style="width:${px}px;height:${px}px"><img src="${cycloneImage(cat)}" alt="" draggable="false" style="width:100%;height:100%" /></div>`;
}
