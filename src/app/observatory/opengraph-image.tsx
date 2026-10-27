import { ImageResponse } from "next/og";
import { getForecastGrid } from "@/lib/observatory/grid";
import { computeWarnings, FEATURES, type Level } from "@/lib/observatory/warnings";

/**
 * Link preview for WhatsApp / X / Telegram: today's warning map of Oman.
 * Text is kept to Latin letters and digits — the image renderer can't join
 * Arabic letters; the Arabic headline lives in the page's og:title instead.
 */
export const runtime = "nodejs";
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "AEGIS Observatory — weather warnings for Oman";

const FILL: Record<Level, string> = { 0: "#2a3140", 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" };
const BOX = { x: 40, y: 35, w: 520, h: 560 };
const B = { lon0: 51.9, lon1: 59.9, lat0: 16.6, lat1: 26.45 };
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

function project(lon: number, lat: number): [number, number] {
  const sx = BOX.w / (B.lon1 - B.lon0);
  const sy = BOX.h / (merc(B.lat1) - merc(B.lat0));
  const s = Math.min(sx, (sy * Math.PI) / 180); // same scale on both axes
  const w = (B.lon1 - B.lon0) * s, h = ((merc(B.lat1) - merc(B.lat0)) * 180) / Math.PI * s;
  return [BOX.x + (BOX.w - w) / 2 + (lon - B.lon0) * s, BOX.y + (BOX.h - h) / 2 + ((merc(B.lat1) - merc(lat)) * 180) / Math.PI * s];
}

function pathOf(g: (typeof FEATURES)[number]["geometry"]) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.flatMap((p) => p.map((ring) => ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project(lon, lat).map((n) => n.toFixed(1)).join(" ")}`).join("") + "Z")).join("");
}

export default async function Image() {
  let levels: Record<string, Level> = {};
  try {
    const w = computeWarnings(await getForecastGrid());
    levels = Object.fromEntries(Object.entries(w.levels).map(([iso, l]) => [iso, l[0] ?? 0])) as Record<string, Level>;
  } catch { /* preview still renders, without colours */ }
  const count = (l: Level) => Object.values(levels).filter((x) => x === l).length;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Muscat", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const any = count(1) + count(2) + count(3) > 0;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #0f1115 0%, #161b26 100%)", color: "#e8ebf0", fontFamily: "sans-serif" }}>
        <svg width="600" height="630" viewBox="0 0 600 630">
          {FEATURES.map((f) => (
            <path key={f.properties.iso} d={pathOf(f.geometry)} fill={FILL[levels[f.properties.iso] ?? 0]} fillOpacity={levels[f.properties.iso] ? 0.9 : 1} stroke="#0f1115" strokeWidth={2} />
          ))}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px 0 20px", flex: 1 }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: "#7ea1ff", fontWeight: 700 }}>AEGIS</div>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, marginTop: 8 }}>Observatory</div>
          <div style={{ fontSize: 28, color: "#9aa4b2", marginTop: 14 }}>Weather warnings · Oman</div>
          <div style={{ fontSize: 30, marginTop: 36 }}>{date}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
            {any ? (
              ([3, 2, 1] as Level[]).filter((l) => count(l)).map((l) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: FILL[l] }} />
                  <div>{`${count(l)} ${count(l) === 1 ? "governorate" : "governorates"} · ${l === 3 ? "red" : l === 2 ? "orange" : "yellow"}`}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 30, color: "#8fd1a6" }}>No warnings today</div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
