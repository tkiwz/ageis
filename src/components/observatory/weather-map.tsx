"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ForecastGrid } from "@/lib/observatory/grid";
import type { Level } from "@/lib/observatory/warnings";
import governorates from "@/lib/observatory/oman-governorates.json";
import { renderToStaticMarkup } from "react-dom/server";
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudRainWind, CloudSun, Moon, Sun } from "lucide-react";
import type { Wilayat } from "@/lib/observatory/place";
import type { RainTrack } from "./rain-tracks";
import wilayatsJson from "@/lib/observatory/wilayats.json";
import { frameOf, inGovernorate, landMask, pointWeather, renderFrame, sample, type Frame, type LayerId, type Polygons, type Symbol } from "./field";

export type MapMode = "layers" | "warnings";

interface GovProps { iso: string; name: string; nameAr: string }
type GovFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, GovProps>;
const GOVS = governorates as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, GovProps>;
const LAND: Polygons = GOVS.features.flatMap((f) =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
) as Polygons;

const WILAYATS = (wilayatsJson as { wilayats: Wilayat[] }).wilayats;
/** Towns that always carry a weather symbol; every wilayat shows once zoomed in. */
const MAJOR = ["Muscat", "Seeb", "Sohar", "Salalah", "Nizwa", "Sur", "Ibri", "Al Buraimi", "Khasab", "Al Rustaq", "Ibra",
  "Haima", "Ad Duqm", "Masirah", "Thumrait", "Adam", "Shinas", "Al Mudhaibi", "Jaalan Bani Bu Ali", "Mahout", "Muqshin", "Dibba", "Bahla", "Barka"];
/** Major towns first, so they win when symbols would overlap. */
const BY_PRIORITY = [...WILAYATS].sort((a, b) => rank(a) - rank(b));
function rank(w: Wilayat) { const k = MAJOR.indexOf(w.name); return k < 0 ? 100 : k; }
const SYMBOL_SVG: Record<Symbol, string> = Object.fromEntries(
  ([
    ["SUN", Sun, "#e9b949"], ["MOON", Moon, "#c9d3e6"], ["PARTLY", CloudSun, "#e3c56b"], ["PARTLY_NIGHT", CloudMoon, "#c9d3e6"],
    ["CLOUD", Cloud, "#b8c2d2"], ["RAIN", CloudRain, "#6fa8dc"], ["HEAVY_RAIN", CloudRainWind, "#4a86d6"],
    ["STORM", CloudLightning, "#e08a3c"], ["FOG", CloudFog, "#aab4c3"],
  ] as const).map(([k, Icon, color]) => [k, renderToStaticMarkup(<Icon size={18} color={color} strokeWidth={2} />)]),
) as Record<Symbol, string>;

/** Warning fills: soft, but distinct for colour-blind readers (lightness also changes). */
export const LEVEL_COLOR: Record<Level, string> = { 0: "transparent", 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" };

// Esri canvas basemaps: quiet greys, labels drawn above the weather layer
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const TILES = {
  dark: { base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  light: { base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
};
const OMAN_BOUNDS = L.latLngBounds([16.6, 51.9], [26.45, 59.9]);
/** Keep Oman clear of the floating panels (layer bar on top, time bar below, side panel in warnings). */
const fitPadding = (mode: MapMode, rtl: boolean) =>
  mode === "warnings" && window.innerWidth >= 640
    ? { paddingTopLeft: L.point(rtl ? 420 : 24, 24), paddingBottomRight: L.point(rtl ? 24 : 420, 24) }
    : mode === "warnings"
      ? { paddingTopLeft: L.point(16, 16), paddingBottomRight: L.point(16, Math.round(window.innerHeight * 0.5)) } // phone: bottom sheet
      : { paddingTopLeft: L.point(16, 70), paddingBottomRight: L.point(16, 190) };

interface Props {
  grid: ForecastGrid;
  mode: MapMode;
  layer: LayerId;
  step: number;
  dark: boolean;
  isAr: boolean;
  /** Warnings mode: worst level per governorate for the chosen day */
  levels?: Record<string, Level>;
  selectedIso?: string | null;
  onSelectIso?: (iso: string | null) => void;
  /** Hover readout text for the current layer, e.g. "31°" */
  formatValue: (layer: LayerId, v: number, dirDeg?: number) => string;
  levelLabel: (l: Level) => string;
  /** The viewer's own position ("my location") */
  myPos?: { lat: number; lon: number } | null;
  /** Rain cells to draw on the rain layer, with a label for where each starts */
  tracks?: { track: RainTrack; startLabel: string }[];
  /** Live satellite instead of the forecast: WMS layer name, frame times, the one shown */
  satellite?: { wms: string; times: string[]; frame: number } | null;
}

const EUMETSAT_WMS = "https://view.eumetsat.int/geoserver/wms";

export function WeatherMap(props: Props) {
  const { grid, mode, layer, step, dark, isAr, levels, selectedIso, onSelectIso, formatValue, levelLabel, myPos, tracks, satellite } = props;
  const showForecast = mode === "layers" && !satellite;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<{ base: L.TileLayer; labels: L.TileLayer } | null>(null);
  const overlay = useRef<L.ImageOverlay | null>(null);
  const govLayer = useRef<L.GeoJSON | null>(null);
  const particles = useRef<WindParticles | null>(null);
  const zoom = useRef<L.Control.Zoom | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const symbols = useRef<L.LayerGroup | null>(null);
  const trackLayer = useRef<L.LayerGroup | null>(null);
  const satFrames = useRef<{ key: string; layers: L.TileLayer.WMS[] } | null>(null);
  const readout = useRef<HTMLDivElement>(null);
  const [zoomTick, setZoomTick] = useState(0);
  const canvas = useMemo(() => (typeof document === "undefined" ? null : document.createElement("canvas")), []);
  const frame = useMemo<Frame>(() => frameOf(grid, layer, step), [grid, layer, step]);
  const live = useRef({ frame, layer, mode, levels, selectedIso, onSelectIso, formatValue, levelLabel, isAr, sat: !!satellite });
  live.current = { frame, layer, mode, levels, selectedIso, onSelectIso, formatValue, levelLabel, isAr, sat: !!satellite };

  // ── Create the map once ───────────────────────────────────
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, {
      zoomControl: false, attributionControl: true, minZoom: 5, maxZoom: 10,
      // maxBounds leaves room to slide Oman beside the warnings panel
      maxBounds: OMAN_BOUNDS.pad(1.5), worldCopyJump: false, zoomSnap: 0.25,
    });
    m.fitBounds(OMAN_BOUNDS, fitPadding("layers", isAr));
    zoom.current = L.control.zoom({ position: "bottomright" }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.createPane("labels").style.zIndex = "450";
    m.createPane("symbols").style.zIndex = "460";
    symbols.current = L.layerGroup([], { pane: "symbols" }).addTo(m);
    m.createPane("tracks").style.zIndex = "465"; // above town symbols so "where it starts" stays readable
    m.getPane("tracks")!.style.pointerEvents = "none";
    trackLayer.current = L.layerGroup([], { pane: "tracks" }).addTo(m);
    m.on("zoomend", () => setZoomTick((z) => z + 1));
    m.getPane("labels")!.style.pointerEvents = "none";

    const gl = L.geoJSON(GOVS, {
      style: () => ({}),
      onEachFeature: (f: GovFeature, lyr) => {
        lyr.on({
          mouseover: () => { if (live.current.mode === "warnings") (lyr as L.Path).setStyle({ weight: 2.2 }); },
          mouseout: () => { if (live.current.mode === "warnings") styleGovs(); },
          click: () => { if (live.current.mode === "warnings") live.current.onSelectIso?.(f.properties.iso); },
        });
      },
    }).addTo(m);
    govLayer.current = gl;

    // Value under the pointer (layers mode) or governorate + level (warnings mode)
    m.on("mousemove", (e: L.LeafletMouseEvent) => {
      const el = readout.current;
      if (!el) return;
      const { frame: fr, layer: ly, mode: md, levels: lv, formatValue: fmt, levelLabel: ll, isAr: ar } = live.current;
      let text: string | null = null;
      if (live.current.sat) { el.style.opacity = "0"; return; } // satellite pictures have no values to read out
      if (md === "layers") {
        if (ly === "wind") {
          const u = sample(grid, fr.u, e.latlng.lat, e.latlng.lng), v = sample(grid, fr.v, e.latlng.lat, e.latlng.lng);
          if (u !== null && v !== null) text = fmt("wind", Math.hypot(u, v), (Math.atan2(-u, -v) * 180) / Math.PI + 360);
        } else {
          const v = sample(grid, fr.values, e.latlng.lat, e.latlng.lng);
          if (v !== null && !(ly === "dust" && v < 0)) text = fmt(ly, v); // dust < 0: beyond the 5-day air-quality forecast
        }
      } else {
        const hit = GOVS.features.find((f) => inGovernorate(f.geometry, e.latlng.lng, e.latlng.lat));
        if (hit) text = `${ar ? hit.properties.nameAr : hit.properties.name} · ${ll(lv?.[hit.properties.iso] ?? 0)}`;
      }
      if (!text) { el.style.opacity = "0"; return; }
      el.textContent = text;
      el.style.opacity = "1";
      el.style.transform = `translate(${e.containerPoint.x + 14}px, ${e.containerPoint.y - 34}px)`;
    });
    m.on("mouseout", () => { if (readout.current) readout.current.style.opacity = "0"; });

    const onLand = landMask(grid, LAND);
    particles.current = new WindParticles(m, (lat, lon) => {
      if (!onLand(lon, lat)) return null;
      const fr = live.current.frame;
      const u = sample(grid, fr.u, lat, lon), v = sample(grid, fr.v, lat, lon);
      return u === null || v === null ? null : [u, v];
    });
    map.current = m;
    return () => {
      // Layers belong to this map instance; drop them so a remount (StrictMode, HMR) rebuilds cleanly
      particles.current?.destroy();
      m.remove();
      map.current = null; overlay.current = null; tiles.current = null; govLayer.current = null; me.current = null; symbols.current = null; trackLayer.current = null; satFrames.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap follows the theme ─────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.base.remove();
    tiles.current?.labels.remove();
    const set = dark ? TILES.dark : TILES.light;
    const attribution = "Esri · © OpenStreetMap · Open-Meteo";
    tiles.current = {
      base: L.tileLayer(set.base, { attribution, maxZoom: 16 }).addTo(m),
      labels: L.tileLayer(set.labels, { maxZoom: 16, pane: "labels" }).addTo(m),
    };
    tiles.current.base.bringToBack();
    particles.current?.setColor(dark ? "rgba(236,240,246,0.6)" : "rgba(38,52,72,0.55)");
  }, [dark]);

  // ── Weather raster ────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !canvas) return;
    if (!showForecast) { overlay.current?.remove(); overlay.current = null; return; }
    renderFrame(canvas, grid, layer, frame, LAND, dark);
    const url = canvas.toDataURL("image/png");
    const bounds = L.latLngBounds([grid.grid.lat0, grid.grid.lon0], [grid.grid.lat1, grid.grid.lon1]);
    if (overlay.current) overlay.current.setUrl(url);
    else overlay.current = L.imageOverlay(url, bounds, { opacity: 1, interactive: false, className: "obs-raster" }).addTo(m);
  }, [canvas, grid, layer, frame, showForecast, dark]);

  // ── Town weather symbols (layers mode) ─────────────────────
  useEffect(() => {
    const m = map.current, grp = symbols.current;
    if (!m || !grp) return;
    grp.clearLayers();
    if (!showForecast) return;
    const all = m.getZoom() >= 7.5;
    const placed: L.Point[] = [];
    for (const w of BY_PRIORITY) {
      if (!all && rank(w) === 100) continue;
      // Skip a symbol that would sit on top of one already drawn
      const pt = m.latLngToContainerPoint([w.lat, w.lon]);
      if (placed.some((q) => Math.abs(q.x - pt.x) < 60 && Math.abs(q.y - pt.y) < (all ? 40 : 28))) continue;
      placed.push(pt);
      const pw = pointWeather(grid, step, w.lat, w.lon);
      const html =
        `<div class="obs-sym">${SYMBOL_SVG[pw.symbol]}<span class="obs-sym-t">${Math.round(pw.temp)}°</span></div>` +
        (all ? `<div class="obs-sym-n">${isAr ? w.nameAr : w.name}</div>` : "");
      L.marker([w.lat, w.lon], {
        pane: "symbols", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "obs-sym-wrap", html, iconSize: [64, all ? 40 : 26], iconAnchor: [32, 13] }),
      }).addTo(grp);
    }
  }, [grid, step, showForecast, isAr, zoomTick]);

  // ── Rain cells: where they form, where they go ───────────────
  useEffect(() => {
    const grp = trackLayer.current;
    if (!grp) return;
    grp.clearLayers();
    if (!showForecast || layer !== "rain" || !tracks) return;
    const colour = dark ? "#9cc9ff" : "#2f6fbf";
    for (const { track, startLabel } of tracks) {
      const pts = track.steps.map((s) => L.latLng(s.lat, s.lon));
      const past = track.steps.filter((s) => s.t <= step).map((s) => L.latLng(s.lat, s.lon));
      // Whole path dashed (expected), the part already "lived" by the slider solid
      if (pts.length > 1) L.polyline(pts, { pane: "tracks", color: colour, weight: 2.5, opacity: 0.85, dashArray: "6 6" }).addTo(grp);
      if (past.length > 1) L.polyline(past, { pane: "tracks", color: colour, weight: 3, opacity: 0.95 }).addTo(grp);
      track.steps.forEach((s) =>
        L.circleMarker([s.lat, s.lon], { pane: "tracks", radius: s.t === step ? 6 : 2.5, color: colour, weight: s.t === step ? 2 : 1, fillColor: colour, fillOpacity: s.t === step ? 0.35 : 0.9 }).addTo(grp));
      // Arrow at the end, pointing the way the cell travels
      if (track.bearing !== null && pts.length > 1) {
        const end = pts[pts.length - 1];
        L.marker(end, {
          pane: "tracks", interactive: false,
          icon: L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9],
            html: `<svg width="18" height="18" viewBox="0 0 18 18" style="transform:rotate(${track.bearing}deg)"><path d="M9 1 L15 15 L9 11 L3 15 Z" fill="${colour}"/></svg>` }),
        }).addTo(grp);
      }
      // Where it starts to form
      if (!track.existing) {
        const s0 = track.steps[0];
        L.marker([s0.lat, s0.lon], {
          pane: "tracks", interactive: false,
          icon: L.divIcon({ className: "obs-genesis-wrap", iconSize: [120, 44], iconAnchor: [60, 12],
            html: `<div class="obs-genesis"></div><div class="obs-genesis-l">${startLabel}</div>` }),
        }).addTo(grp);
      }
    }
  }, [tracks, showForecast, layer, step, dark]);

  // ── Satellite: one WMS layer per frame, created when first shown and kept (hidden) for replay ──
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const key = satellite?.wms ?? "";
    if (satFrames.current && (satFrames.current.key !== key || !satellite)) {
      satFrames.current.layers.forEach((l) => l.remove());
      satFrames.current = null;
    }
    if (!satellite) return;
    satFrames.current ??= { key, layers: [] };
    const cache = satFrames.current;
    const time = satellite.times[satellite.frame];
    let current = cache.layers.find((l) => (l.wmsParams as { TIME?: string }).TIME === time);
    if (!current) {
      current = L.tileLayer.wms(EUMETSAT_WMS, {
        layers: satellite.wms, format: "image/png", transparent: true, version: "1.3.0",
        attribution: "EUMETSAT", opacity: 0, TIME: time, maxZoom: 10,
      } as L.WMSOptions & { TIME: string }).addTo(m);
      cache.layers.push(current);
    }
    // Keep the previous picture until the new one has loaded, so playback doesn't flash
    const show = current;
    const reveal = () => cache.layers.forEach((l) => l.setOpacity(l === show ? 0.92 : 0));
    if ((show as unknown as { _loading?: boolean })._loading) show.once("load", reveal); else reveal();
  }, [satellite]);

  // "My location": a calm dot, and the map moves there
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!myPos) { me.current?.remove(); me.current = null; return; }
    const ll = L.latLng(myPos.lat, myPos.lon);
    if (!me.current) {
      me.current = L.circleMarker(ll, { radius: 7, color: "#ffffff", weight: 2.5, fillColor: "hsl(220 83% 60%)", fillOpacity: 1, className: "obs-me", pane: "markerPane" }).addTo(m);
    } else me.current.setLatLng(ll);
    m.flyTo(ll, Math.max(m.getZoom(), 8), { duration: 0.8 });
  }, [myPos]);

  // Zoom buttons sit on the side the panels leave free (the map itself is always LTR)
  useEffect(() => {
    const awayFromPanel = mode === "warnings" ? !isAr : isAr;
    zoom.current?.setPosition(awayFromPanel ? "bottomleft" : "bottomright");
  }, [mode, isAr]);

  // ── Wind particles only on the wind layer ─────────────────
  useEffect(() => {
    particles.current?.setActive(showForecast && layer === "wind");
  }, [showForecast, layer]);

  // ── Governorate styling ───────────────────────────────────
  function styleGovs() {
    const gl = govLayer.current;
    if (!gl) return;
    const { mode: md, levels: lv, selectedIso: sel } = live.current;
    gl.eachLayer((lyr) => {
      const f = (lyr as L.Polygon).feature as GovFeature;
      const lvl = (lv?.[f.properties.iso] ?? 0) as Level;
      const isSel = sel === f.properties.iso;
      (lyr as L.Path).setStyle(
        md === "warnings"
          ? {
              color: isSel ? (dark ? "#f4f5f8" : "#1f2937") : lvl ? LEVEL_COLOR[lvl] : dark ? "rgba(220,226,235,0.35)" : "rgba(31,41,55,0.35)",
              weight: isSel ? 2.6 : lvl ? 1.4 : 0.8,
              fillColor: lvl ? LEVEL_COLOR[lvl] : dark ? "#9aa4b2" : "#64748b",
              fillOpacity: lvl ? (isSel ? 0.5 : 0.36) : 0.04,
            }
          : { color: dark ? "rgba(230,234,240,0.32)" : "rgba(31,41,55,0.3)", weight: 0.7, fillOpacity: 0, interactive: false },
      );
    });
  }
  useEffect(styleGovs);

  // Fly to a selected governorate
  useEffect(() => {
    const m = map.current, gl = govLayer.current;
    if (!m || !gl || mode !== "warnings") return;
    if (!selectedIso) { m.flyToBounds(OMAN_BOUNDS, { ...fitPadding(mode, isAr), duration: 0.6 }); return; }
    gl.eachLayer((lyr) => {
      const f = (lyr as L.Polygon).feature as GovFeature;
      if (f.properties.iso === selectedIso) m.flyToBounds((lyr as L.Polygon).getBounds(), { padding: [60, 60], maxZoom: 8, duration: 0.6 });
    });
  }, [selectedIso, mode, isAr]);

  return (
    <div className="obs-map relative h-full w-full" dir="ltr">
      <div ref={box} className="h-full w-full bg-muted" />
      <div
        ref={readout}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-[1000] whitespace-nowrap rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-sm opacity-0 backdrop-blur transition-opacity"
        dir={isAr ? "rtl" : "ltr"}
      />
    </div>
  );
}

/**
 * Thin moving streaks that follow the wind field. Respects reduced-motion
 * (draws still arrows instead) and stops while the tab is hidden.
 */
class WindParticles {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private pts: { x: number; y: number; age: number }[] = [];
  private raf = 0;
  private active = false;
  private moving = false;
  private color = "rgba(236,240,246,0.6)";
  private reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private map: L.Map, private uv: (lat: number, lon: number) => [number, number] | null) {
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", zIndex: "401", pointerEvents: "none" });
    map.getContainer().appendChild(this.canvas);
    map.on("movestart zoomstart", this.onMoveStart);
    map.on("moveend zoomend resize", this.onMoveEnd);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  setColor(c: string) { this.color = c; if (this.active) this.restart(); }
  setActive(on: boolean) { this.active = on; on ? this.restart() : this.stop(true); }

  destroy() {
    this.stop(true);
    this.map.off("movestart zoomstart", this.onMoveStart);
    this.map.off("moveend zoomend resize", this.onMoveEnd);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.remove();
  }

  private onMoveStart = () => { this.moving = true; this.stop(true); };
  private onMoveEnd = () => { this.moving = false; if (this.active) this.restart(); };
  private onVisibility = () => { if (document.hidden) this.stop(false); else if (this.active && !this.moving) this.loop(); };

  private stop(clear: boolean) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (clear) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private restart() {
    this.stop(true);
    const size = this.map.getSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = size.x * dpr; this.canvas.height = size.y * dpr;
    this.canvas.style.width = `${size.x}px`; this.canvas.style.height = `${size.y}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.reduced) { this.drawArrows(); return; }
    const count = Math.min(1500, Math.round((size.x * size.y) / 600));
    this.pts = Array.from({ length: count }, () => this.spawn(true));
    this.loop();
  }

  /** A random point that has wind (i.e. over land); falls back to anywhere after a few tries. */
  private spawn(randomAge = false) {
    const s = this.map.getSize();
    let x = 0, y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = Math.random() * s.x; y = Math.random() * s.y;
      const ll = this.map.containerPointToLatLng([x, y]);
      if (this.uv(ll.lat, ll.lng)) break;
    }
    return { x, y, age: randomAge ? Math.floor(Math.random() * 80) : 0 };
  }

  private loop = () => {
    if (!this.active || document.hidden) return;
    const { ctx } = this;
    const s = this.map.getSize();
    // Fade old trails
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, 0, s.x, s.y);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const k = 0.05 * Math.pow(2, this.map.getZoom() - 5); // px per frame per km/h
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const ll = this.map.containerPointToLatLng([p.x, p.y]);
      const w = this.uv(ll.lat, ll.lng);
      if (!w || p.age++ > 90 || p.x < 0 || p.y < 0 || p.x > s.x || p.y > s.y) { this.pts[i] = this.spawn(); continue; }
      const nx = p.x + w[0] * k, ny = p.y - w[1] * k;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      p.x = nx; p.y = ny;
    }
    ctx.stroke();
    this.raf = requestAnimationFrame(this.loop);
  };

  private drawArrows() {
    const { ctx } = this;
    const s = this.map.getSize();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.2;
    for (let y = 30; y < s.y; y += 48) for (let x = 30; x < s.x; x += 48) {
      const ll = this.map.containerPointToLatLng([x, y]);
      const w = this.uv(ll.lat, ll.lng);
      if (!w) continue;
      const len = Math.min(18, 4 + Math.hypot(w[0], w[1]) * 0.4), a = Math.atan2(-w[1], w[0]);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(ex, ey);
      ctx.lineTo(ex - Math.cos(a - 0.5) * 5, ey - Math.sin(a - 0.5) * 5);
      ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a + 0.5) * 5, ey - Math.sin(a + 0.5) * 5);
      ctx.stroke();
    }
  }
}
