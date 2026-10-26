"use client";

/**
 * Pipeline 3D scene — AEGIS control-room style.
 *
 * - The pipe follows its real route, projected from the sensors' GPS points
 *   (falls back to a schematic straight line when there is no usable geometry).
 * - The pipe surface is coloured by pressure health between sensors
 *   (in range → near limit → out of range), with a hot spot at an active leak.
 * - Flow particles travel from start to end; speed follows the measured flow.
 * - Mouse/touch via OrbitControls; PS5/Xbox controller via useGamepadControls.
 * - No WhatsApp is sent automatically — only the explicit "Send" button does.
 */
import { useRef, useState, useEffect, useCallback, useMemo, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  Activity, AlertTriangle, Bell, BellOff, Brain, Crosshair, Gamepad2, Grid3x3, History, Loader2,
  Map as MapIcon, MapPin, Pause, Play, RotateCcw, Send, Sparkles, Tags, Waves, Wrench, X,
} from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { useGamepadControls } from "./useGamepadControls";
import {
  IMAGERY_URL, loadElevation, loadImage, makeProjection, pickTiles, tileXToLng, tileYToLat,
  type BBox, type ElevationSampler, type Projection, type TileRange,
} from "./geo";

export interface PressurePoint {
  id: string;
  code: string;
  positionKm: number;
  currentPressure: number | null;
  currentFlow:     number | null;
  currentTemp:     number | null;
  expectedMin: number;
  expectedMax: number;
  latitude:    number;
  longitude:   number;
  status: string;
}

export interface Pipeline3DSceneProps {
  pipelineId:     string;
  pipelineName:   string;
  pipelineLength: number;
  pressurePoints: PressurePoint[];
  hasLeak?:       boolean;
  leakKm?:        number;
  leakSeverity?:  "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface PointAnalysis {
  risk:              string;
  riskAr:            string;
  confidence:        number;
  summary:           string;
  summaryAr:         string;
  trend:             string;
  recommendations:   string[];
  recommendationsAr: string[];
  maintenanceFlag:   boolean;
}

// ─────────────────────────────────────────────────────────
// Visual identity (matches the app's dark theme tokens)
// ─────────────────────────────────────────────────────────
const C = {
  bg:       "#0b0e14",
  fog:      "#0b0e14",
  ground:   "#0f141d",
  grid:     "#1b2433",
  section:  "#2a3a55",
  primary:  "#5b8def",
  steel:    "#3a4558",
  steelDim: "#262e3b",
  ok:       "#3fb68b",
  warn:     "#e5a53b",
  danger:   "#ef5a52",
};
const STATUS_COLORS: Record<string, string> = { NORMAL: C.ok, WARNING: C.warn, CRITICAL: C.danger };
const RISK_COLORS: Record<string, string> = { LOW: C.ok, MEDIUM: C.warn, HIGH: "#f08a3c", CRITICAL: C.danger, NO_DATA: "#6b7280" };

const SCENE_SIZE = 34;          // longest side of the route, in scene units
const PIPE_RADIUS = 0.42;
/** The pipe runs this far above the ground (flat mode: ground at y = -LIFT). */
const LIFT = 1.1;
const GROUND_Y = -LIFT;
/** Tallest terrain relief allowed in the scene, in scene units (keeps steep areas readable). */
const MAX_RELIEF = 6;

// ─────────────────────────────────────────────────────────
// Geometry: route from GPS, health along the pipe
// ─────────────────────────────────────────────────────────
interface Route {
  curve: THREE.CatmullRomCurve3;
  center: THREE.Vector3;
  span: number;
  geographic: boolean;
  /** Only for geographic routes. */
  projection: Projection | null;
  bbox: BBox | null;
}

/** Projects sensor GPS points onto a local plane (km), then scales to the scene. */
function buildRoute(points: PressurePoint[], lengthKm: number): Route {
  const sorted = [...points].sort((a, b) => a.positionKm - b.positionKm);
  const usable = sorted.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

  let km: THREE.Vector3[] = [];
  let geographic = false;
  let lat0 = 0, lng0 = 0;
  if (usable.length >= 2) {
    lat0 = usable.reduce((s, p) => s + p.latitude, 0) / usable.length;
    lng0 = usable.reduce((s, p) => s + p.longitude, 0) / usable.length;
    const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
    const kz = 110.57;
    km = usable.map((p) => new THREE.Vector3((p.longitude - lng0) * kx, 0, -(p.latitude - lat0) * kz));
    const extent = new THREE.Box3().setFromPoints(km).getSize(new THREE.Vector3());
    geographic = Math.max(extent.x, extent.z) > 0.05; // sensors are actually apart
  }

  if (geographic) {
    // Extend to km 0 and the pipeline end along the first/last segment direction
    const first = usable[0], second = usable[1];
    const last = usable[usable.length - 1], prev = usable[usable.length - 2];
    const extend = (a: THREE.Vector3, b: THREE.Vector3, kmA: number, kmB: number, kmTarget: number) => {
      const span = kmB - kmA;
      if (Math.abs(span) < 1e-6) return null;
      return a.clone().add(b.clone().sub(a).multiplyScalar((kmTarget - kmA) / span));
    };
    const start = first.positionKm > 0.01 ? extend(km[0], km[1], first.positionKm, second.positionKm, 0) : null;
    const end = lengthKm - last.positionKm > 0.01
      ? extend(km[km.length - 2], km[km.length - 1], prev.positionKm, last.positionKm, lengthKm)
      : null;
    if (start) km.unshift(start);
    if (end) km.push(end);
  } else {
    km = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.max(lengthKm, 1), 0, 0)];
  }

  // Scale to the scene and centre on the origin
  const box = new THREE.Box3().setFromPoints(km);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const scale = SCENE_SIZE / Math.max(size.x, size.z, 1e-6);
  const pts = km.map((v) => v.clone().sub(mid).multiplyScalar(scale));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);

  let projection: Projection | null = null;
  let bbox: BBox | null = null;
  if (geographic) {
    projection = makeProjection(lat0, lng0, scale, mid.x, mid.z);
    // Ground area: route box padded on every side (and at least ~square)
    const half = (Math.max(size.x, size.z) * scale) / 2 * 1.35;
    const corners = [projection.toLatLng(-half, -half), projection.toLatLng(half, half)];
    bbox = {
      minLat: Math.min(corners[0].lat, corners[1].lat), maxLat: Math.max(corners[0].lat, corners[1].lat),
      minLng: Math.min(corners[0].lng, corners[1].lng), maxLng: Math.max(corners[0].lng, corners[1].lng),
    };
  }
  return { curve, center: new THREE.Vector3(0, 0, 0), span: Math.max(size.x, size.z) * scale, geographic, projection, bbox };
}

/** Terrain height model in scene units (null = flat ground). */
interface Terrain {
  /** Ground y at a scene x/z. */
  groundAt: (x: number, z: number) => number;
}

function makeTerrain(route: Route, elev: ElevationSampler): Terrain | null {
  const proj = route.projection;
  if (!proj) return null;
  const relief = Math.max(elev.max - elev.min, 1);
  const exaggeration = Math.min(3, MAX_RELIEF / ((relief * proj.unitsPerKm) / 1000));
  const unitsPerMetre = (proj.unitsPerKm / 1000) * exaggeration;
  return {
    groundAt: (x, z) => {
      const { lat, lng } = proj.toLatLng(x, z);
      return GROUND_Y + (elev.at(lat, lng) - elev.min) * unitsPerMetre;
    },
  };
}

/** Same route, lifted onto the terrain (dense resample so the pipe hugs the ground). */
function liftRoute(route: Route, terrain: Terrain | null): Route {
  if (!terrain) return route;
  const pts = route.curve.getSpacedPoints(260).map((p) => new THREE.Vector3(p.x, terrain.groundAt(p.x, p.z) + LIFT, p.z));
  return { ...route, curve: new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5) };
}

/** 0 = comfortably in range, ~0.6 = near a limit, 1 = out of range / no data at a critical sensor. */
function healthScore(p: PressurePoint): number {
  if (p.status === "CRITICAL") return 1;
  if (p.currentPressure === null) return p.status === "WARNING" ? 0.6 : 0.15;
  const { currentPressure: v, expectedMin: lo, expectedMax: hi } = p;
  if (v < lo || v > hi) return 1;
  const mid = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2, 1e-6);
  const s = Math.abs(v - mid) / half;           // 0 centre … 1 at the limit
  return Math.max(p.status === "WARNING" ? 0.55 : 0, Math.min(0.8, s * 0.8));
}

const COL_OK = new THREE.Color(C.primary).lerp(new THREE.Color(C.steel), 0.55);
const COL_WARN = new THREE.Color(C.warn);
const COL_BAD = new THREE.Color(C.danger);
function healthColor(s: number, out = new THREE.Color()): THREE.Color {
  if (s <= 0.5) return out.copy(COL_OK).lerp(COL_WARN, s / 0.5);
  return out.copy(COL_WARN).lerp(COL_BAD, (s - 0.5) / 0.5);
}

/** Health at a km position: linear between neighbouring sensors, plus the leak hot spot. */
function healthAt(km: number, sensors: { km: number; s: number }[], leakKm: number | null, lengthKm: number): number {
  let s = 0;
  if (sensors.length === 1) s = sensors[0].s;
  else if (sensors.length > 1) {
    if (km <= sensors[0].km) s = sensors[0].s;
    else if (km >= sensors[sensors.length - 1].km) s = sensors[sensors.length - 1].s;
    else {
      for (let i = 0; i < sensors.length - 1; i++) {
        const a = sensors[i], b = sensors[i + 1];
        if (km >= a.km && km <= b.km) {
          const t = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
          s = a.s + (b.s - a.s) * t;
          break;
        }
      }
    }
  }
  if (leakKm !== null) {
    const width = Math.max(lengthKm * 0.04, 0.5);
    s = Math.max(s, Math.exp(-((km - leakKm) ** 2) / (2 * width * width)));
  }
  return s;
}

// ─────────────────────────────────────────────────────────
// Error boundary — surfaces silent Three.js failures
// ─────────────────────────────────────────────────────────
class SceneErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error("[Pipeline3D]", err); }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────
export function Pipeline3DScene({
  pipelineId,
  pipelineName,
  pipelineLength,
  pressurePoints,
  hasLeak = false,
  leakKm = 0,
  leakSeverity = "HIGH",
}: Pipeline3DSceneProps) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const kmLabel = (n: number) => t("assets.units.kmAt", { n: f.number(n, { maximumFractionDigits: 1 }) });

  const [focusedIdx,  setFocusedIdx]  = useState<number | null>(null); // D-pad cursor
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null); // HUD open
  const [autoRotate,  setAutoRotate]  = useState(false);
  const [showFlow,    setShowFlow]    = useState(true);
  const [resetTick,   setResetTick]   = useState(0);
  const [focusKm,     setFocusKm]     = useState<number | null>(null);
  const [aiAnalysis,  setAiAnalysis]  = useState<PointAnalysis | null>(null);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiError,     setAiError]     = useState<string | null>(null);
  const [waStatus,    setWaStatus]    = useState<"idle" | "sending" | "sent" | "error">("idle");
  // Panels start folded on small screens so the scene stays visible
  const [listOpen,    setListOpen]    = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const [legendOpen,  setLegendOpen]  = useState(() => typeof window === "undefined" || window.innerWidth >= 768);

  const isWide = typeof window === "undefined" || window.innerWidth >= 768;
  const [mapMode,   setMapMode]   = useState(true);     // satellite + terrain (geographic routes only)
  const [glow,      setGlow]      = useState(isWide);   // bloom is heavier — off by default on phones
  const [labels,    setLabels]    = useState(true);
  const [elevation, setElevation] = useState<ElevationSampler | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  const [mapReady,  setMapReady]  = useState(false);

  // Timeline: readings of the last 24 h; null time = live values
  const history = usePressureHistory(pipelineId);
  const [timeAt, setTimeAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shownPoints = useMemo(
    () => (timeAt === null || !history ? pressurePoints : pointsAt(pressurePoints, history, timeAt)),
    [pressurePoints, history, timeAt],
  );

  const baseRoute = useMemo(() => buildRoute(pressurePoints, pipelineLength), [pressurePoints, pipelineLength]);
  const useMap = mapMode && baseRoute.geographic && !geoFailed;
  const terrain = useMemo(() => (useMap && elevation ? makeTerrain(baseRoute, elevation) : null), [useMap, elevation, baseRoute]);
  const route = useMemo(() => liftRoute(baseRoute, terrain), [baseRoute, terrain]);
  const kmToU = useCallback((km: number) => (pipelineLength > 0 ? Math.min(1, Math.max(0, km / pipelineLength)) : 0), [pipelineLength]);
  const pointAt = useCallback((km: number) => route.curve.getPointAt(kmToU(km)), [route, kmToU]);

  // ── Alarm (sound + banner) ──────────────────────────────
  const [alarmMuted,     setAlarmMuted]     = useState(false);
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const alarmLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const criticalPts = shownPoints.filter((p) => p.status === "CRITICAL");
  const warningPts  = shownPoints.filter((p) => p.status === "WARNING");
  const alarmLevel  = hasLeak ? "LEAK" : criticalPts.length > 0 ? "CRITICAL" : warningPts.length > 0 ? "WARNING" : null;

  /** Control-room tone: triple 880 Hz pulse for leak/critical, single 660 Hz for warning. */
  const playAlarm = useCallback((level: string) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const beep = (startAt: number, freq: number, duration: number, vol: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass";
        bpf.frequency.value = freq;
        bpf.Q.value = 1.2;
        o.type = "square";
        o.frequency.value = freq;
        o.connect(bpf); bpf.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, startAt);
        g.gain.linearRampToValueAtTime(vol, startAt + 0.002);
        g.gain.setValueAtTime(vol, startAt + duration - 0.015);
        g.gain.linearRampToValueAtTime(0, startAt + duration);
        o.start(startAt);
        o.stop(startAt + duration + 0.005);
      };
      if (level === "LEAK" || level === "CRITICAL") {
        beep(now, 880, 0.12, 0.2); beep(now + 0.2, 880, 0.12, 0.2); beep(now + 0.4, 880, 0.12, 0.2);
      } else {
        beep(now, 660, 0.3, 0.14);
      }
    } catch { /* AudioContext needs a user gesture — skip */ }
  }, []);

  useEffect(() => {
    if (!alarmLevel || alarmMuted || alarmDismissed) {
      if (alarmLoopRef.current) { clearInterval(alarmLoopRef.current); alarmLoopRef.current = null; }
      return;
    }
    playAlarm(alarmLevel);
    alarmLoopRef.current = setInterval(() => playAlarm(alarmLevel), alarmLevel === "WARNING" ? 4000 : 3000);
    return () => { if (alarmLoopRef.current) { clearInterval(alarmLoopRef.current); alarmLoopRef.current = null; } };
  }, [alarmLevel, alarmMuted, alarmDismissed, playAlarm]);

  useEffect(() => { if (!alarmLevel) setAlarmDismissed(false); }, [alarmLevel]);

  // ── Actions ─────────────────────────────────────────────
  const selected = selectedIdx !== null ? shownPoints[selectedIdx] : null;

  const runAnalysis = useCallback(() => {
    if (!selected || aiLoading) return;
    if (aiAnalysis) { setAiAnalysis(null); setAiError(null); return; }
    setAiLoading(true);
    setAiError(null);
    fetch(`/api/pipelines/${pipelineId}/point-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body: JSON.stringify({ pointCode: selected.code }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setAiAnalysis(d.data.analysis); else setAiError(d.error?.message || t("assets.pipeline3d.ai.failed")); })
      .catch(() => setAiError(t("assets.pipeline3d.ai.failed")))
      .finally(() => setAiLoading(false));
  }, [selected, aiLoading, aiAnalysis, pipelineId, t]);

  const shareSensor = useCallback((ask: boolean) => {
    const pt = selected;
    if (!pt || waStatus === "sending") return;
    if (ask && !window.confirm(t("assets.pipeline3d.shareConfirm"))) return;
    const W = (k: string, v?: Record<string, string | number>) => t(`assets.pipeline3d.whatsapp.${k}` as MessageKey, v);
    const noData = W("noData");
    const message = [
      W("reportTitle"),
      W("pipeline", { name: pipelineName }),
      W("sensor", { code: pt.code }),
      W("position", { km: kmLabel(pt.positionKm) }),
      W("status", { status: f.enum("status", pt.status) }),
      W("pressure", { value: pt.currentPressure !== null ? `${pt.currentPressure.toFixed(1)} ${t("assets.units.bar")}` : noData, min: pt.expectedMin, max: pt.expectedMax }),
      W("flow", { value: pt.currentFlow !== null ? `${pt.currentFlow.toFixed(0)} ${t("assets.units.flow")}` : noData }),
      W("temperature", { value: pt.currentTemp !== null ? `${pt.currentTemp.toFixed(1)} ${t("assets.units.celsius")}` : noData }),
      W("location", { lat: pt.latitude.toFixed(6), lng: pt.longitude.toFixed(6) }),
      W("map", { url: `https://maps.google.com/?q=${pt.latitude.toFixed(6)},${pt.longitude.toFixed(6)}` }),
      W("reportFooter"),
    ].join("\n");
    setWaStatus("sending");
    fetch("/api/notify/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body: JSON.stringify({ message }),
    })
      .then((r) => r.json())
      .then((d) => setWaStatus(d.ok ? "sent" : "error"))
      .catch(() => setWaStatus("error"))
      .finally(() => setTimeout(() => setWaStatus("idle"), 4000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, waStatus, pipelineName, t]);

  useEffect(() => {
    if (!playing || !history) return;
    const id = window.setInterval(() => {
      setTimeAt((t) => {
        const next = (t ?? history.from) + (history.to - history.from) / 120;
        if (next >= history.to) { setPlaying(false); return null; }
        return next;
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, history]);

  const resetView = useCallback(() => {
    setResetTick((n) => n + 1);
    setFocusKm(null);
    setAutoRotate(false);
  }, []);

  // ── Gamepad ─────────────────────────────────────────────
  const gamepad = useGamepadControls();
  useEffect(() => { if (gamepad.connected) setAutoRotate(false); }, [gamepad.connected]);
  useEffect(() => { if (gamepad.circle) setAutoRotate((v) => !v); }, [gamepad.circle]);
  useEffect(() => {
    if (gamepad.triangle) { resetView(); setFocusedIdx(null); setSelectedIdx(null); setAiAnalysis(null); }
  }, [gamepad.triangle, resetView]);
  useEffect(() => {
    if (pressurePoints.length === 0) return;
    if (gamepad.dpadRight) setFocusedIdx((p) => (p === null ? 0 : (p + 1) % pressurePoints.length));
    if (gamepad.dpadLeft) setFocusedIdx((p) => (p === null ? pressurePoints.length - 1 : (p - 1 + pressurePoints.length) % pressurePoints.length));
  }, [gamepad.dpadLeft, gamepad.dpadRight, pressurePoints.length]);
  useEffect(() => {
    if (!gamepad.cross) return;
    if (aiAnalysis || aiError) { setAiAnalysis(null); setAiError(null); return; }
    if (selectedIdx !== null) { setSelectedIdx(null); return; }
    if (focusedIdx !== null) { setSelectedIdx(focusedIdx); setFocusKm(pressurePoints[focusedIdx]?.positionKm ?? null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.cross]);
  useEffect(() => {
    if (!gamepad.square) return;
    if (aiAnalysis || aiError) { setAiAnalysis(null); setAiError(null); } else setSelectedIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.square]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (gamepad.touchpad) runAnalysis(); }, [gamepad.touchpad]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (gamepad.r1) shareSensor(false); }, [gamepad.r1]);

  const selectPoint = (i: number) => {
    const same = selectedIdx === i;
    setFocusedIdx(i);
    setSelectedIdx(same ? null : i);
    setAiAnalysis(null); setAiError(null);
    if (!same) setFocusKm(pressurePoints[i].positionKm);
    if (!same && window.innerWidth < 768) setListOpen(false); // keep the sensor card readable on phones
  };

  const avgFlow = useMemo(() => {
    const flows = pressurePoints.map((p) => p.currentFlow).filter((v): v is number => v !== null && v > 0);
    return flows.length ? flows.reduce((s, v) => s + v, 0) / flows.length : null;
  }, [pressurePoints]);

  const alarmRed = alarmLevel === "LEAK" || alarmLevel === "CRITICAL";

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-[#0b0e14] text-[#e6ebf2]" dir={isAr ? "rtl" : "ltr"}>
      {/* ── Alarm banner ── */}
      {alarmLevel && !alarmDismissed && (
        <div className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 text-sm text-white backdrop-blur ${alarmRed ? "bg-[#c2413b]/90" : "bg-[#b5801f]/90"}`}>
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {alarmLevel === "LEAK"
              ? t("assets.pipeline3d.alarm.leak", { km: kmLabel(leakKm) })
              : alarmLevel === "CRITICAL"
                ? t("assets.pipeline3d.alarm.critical", { n: criticalPts.length })
                : t("assets.pipeline3d.alarm.warning", { n: warningPts.length })}
          </span>
          <span className="flex items-center gap-2">
            {hasLeak && (
              <OverlayButton onClick={() => setFocusKm(leakKm)} icon={Crosshair} label={t("assets.pipeline3d.view.focusLeak")} light />
            )}
            <OverlayButton
              onClick={() => setAlarmMuted((v) => !v)}
              icon={alarmMuted ? Bell : BellOff}
              label={alarmMuted ? t("assets.pipeline3d.alarm.unmute") : t("assets.pipeline3d.alarm.mute")}
              light
            />
            <OverlayButton onClick={() => setAlarmDismissed(true)} icon={X} label={t("assets.pipeline3d.alarm.dismiss")} light />
          </span>
        </div>
      )}

      {/* ── Title + view controls ── */}
      <div className={`absolute inset-x-3 z-20 flex items-start justify-between gap-3 ${alarmLevel && !alarmDismissed ? "top-14" : "top-3"}`}>
        <Panel className="px-3 py-2">
          <div className="text-[11px] text-[#8b97a8]">{t("assets.pipeline3d.scene.pipeline")}</div>
          <div className="font-mono text-sm font-semibold">{pipelineName}</div>
          <div className="text-[11px] text-[#8b97a8]">
            {kmLabel(pipelineLength)}
            <span className="hidden sm:inline"> · {route.geographic ? t("assets.pipeline3d.view.route") : t("assets.pipeline3d.view.straight")}</span>
          </div>
        </Panel>
        <div className="flex flex-wrap justify-end gap-2">
          <OverlayButton onClick={() => setAutoRotate((v) => !v)} icon={autoRotate ? Pause : Play}
            label={autoRotate ? t("assets.pipeline3d.scene.rotateOff") : t("assets.pipeline3d.scene.rotateOn")} />
          <OverlayButton onClick={() => setShowFlow((v) => !v)} icon={Waves}
            label={showFlow ? t("assets.pipeline3d.view.flowOff") : t("assets.pipeline3d.view.flowOn")} />
          {baseRoute.geographic && (
            <OverlayButton onClick={() => setMapMode((v) => !v)} icon={useMap ? Grid3x3 : MapIcon}
              label={useMap ? t("assets.pipeline3d.view.gridMode") : t("assets.pipeline3d.view.mapMode")} />
          )}
          <OverlayButton onClick={() => setLabels((v) => !v)} icon={Tags}
            label={labels ? t("assets.pipeline3d.view.labelsOff") : t("assets.pipeline3d.view.labelsOn")} />
          <OverlayButton onClick={() => setGlow((v) => !v)} icon={Sparkles}
            label={glow ? t("assets.pipeline3d.view.glowOff") : t("assets.pipeline3d.view.glowOn")} />
          <OverlayButton onClick={resetView} icon={RotateCcw} label={t("assets.pipeline3d.view.reset")} />
        </div>
      </div>

      {/* ── Sensors list ── */}
      <Panel className={`absolute bottom-3 start-3 z-20 w-60 overflow-y-auto p-2 sm:w-64 ${listOpen ? "max-h-[45%] sm:max-h-[55%]" : ""}`}>
        <button type="button" onClick={() => setListOpen((v) => !v)}
          className="flex w-full items-center justify-between px-1 text-[11px] text-[#8b97a8] hover:text-[#e6ebf2]">
          <span>{t("assets.pipeline3d.scene.points")} ({pressurePoints.length})</span>
          <span className="flex items-center gap-2">
            {gamepad.connected && <span className="text-[#5b8def]">{t("assets.pipeline3d.scene.gamepadHint")}</span>}
            <span aria-hidden>{listOpen ? "▾" : "▸"}</span>
          </span>
        </button>
        {listOpen && <div className="mt-1.5 space-y-0.5">
          {shownPoints.map((p, i) => {
            const color = STATUS_COLORS[p.status] ?? C.ok;
            const isSelected = selectedIdx === i;
            const isFocused = focusedIdx === i;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPoint(i)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-xs transition-colors ${
                  isSelected ? "bg-[#5b8def]/20 ring-1 ring-[#5b8def]/50" : isFocused ? "bg-white/[0.06] ring-1 ring-white/20" : "hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${p.status === "CRITICAL" ? "animate-pulse" : ""}`} style={{ backgroundColor: color }} />
                  <span className="font-mono font-medium">{p.code}</span>
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] text-[#8b97a8]">
                  {p.currentPressure !== null && <span style={{ color }}>{p.currentPressure.toFixed(1)}</span>}
                  <span>{kmLabel(p.positionKm)}</span>
                </span>
              </button>
            );
          })}
          {pressurePoints.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-[#8b97a8]">{t("assets.pipeline3d.scene.noPoints")}</div>
          )}
        </div>}
      </Panel>

      {/* ── Legend ── */}
      <Panel className="absolute bottom-3 end-3 z-20 px-3 py-2 text-[11px]">
        <button type="button" onClick={() => setLegendOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-[#8b97a8] hover:text-[#e6ebf2]">
          <span>{t("assets.pipeline3d.view.pipeColour")}</span>
          <span aria-hidden>{legendOpen ? "▾" : "▸"}</span>
        </button>
        {legendOpen && <div className="mt-1.5">
        <div className="mb-1 h-1.5 w-40 rounded-full" style={{ background: `linear-gradient(${isAr ? "to left" : "to right"}, #${COL_OK.getHexString()}, ${C.warn}, ${C.danger})` }} />
        <div className="mb-2 flex w-40 justify-between text-[10px] text-[#8b97a8]">
          <span>{t("assets.pipeline3d.view.healthy")}</span>
          <span>{t("assets.pipeline3d.view.edge")}</span>
          <span>{t("assets.pipeline3d.view.out")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#8b97a8]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#5b8def]" />
          {t("assets.pipeline3d.view.flowDir")}: {t("assets.pipeline3d.view.start")} → {t("assets.pipeline3d.view.end")}
        </div>
        {gamepad.connected && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[#5b8def]">
            <Gamepad2 className="h-3.5 w-3.5" /> {t("assets.pipeline3d.scene.controller")}
          </div>
        )}
        </div>}
      </Panel>

      {/* ── Timeline ── */}
      {history && (
        <TimelineBar
          history={history}
          timeAt={timeAt}
          playing={playing}
          onChange={(v) => { setPlaying(false); setTimeAt(v); }}
          onPlay={() => { if (timeAt === null) setTimeAt(history.from); setPlaying((v) => !v); }}
          onLive={() => { setPlaying(false); setTimeAt(null); }}
        />
      )}

      {useMap && !mapReady && (
        <div className="absolute start-1/2 top-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#11161f]/85 px-3 py-1.5 text-xs text-[#8b97a8] backdrop-blur rtl:translate-x-1/2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5b8def]" /> {t("assets.pipeline3d.view.mapLoading")}
        </div>
      )}

      {/* ── Map attribution ── */}
      {useMap && (
        <div className="pointer-events-none absolute bottom-0 start-1/2 z-10 -translate-x-1/2 px-2 pb-0.5 text-[9px] text-white/50 rtl:translate-x-1/2" dir="ltr">
          Imagery © Esri, Maxar, Earthstar Geographics · Terrain © Mapzen, AWS
        </div>
      )}

      {/* ── Sensor HUD ── */}
      {selected && !aiAnalysis && !aiLoading && !aiError && (
        <SensorHUD
          point={selected}
          index={selectedIdx!}
          total={pressurePoints.length}
          gamepadConnected={gamepad.connected}
          sharing={waStatus === "sending"}
          onAnalyze={runAnalysis}
          onShare={() => shareSensor(true)}
          onClose={() => setSelectedIdx(null)}
          kmLabel={kmLabel}
          topOffset={alarmLevel && !alarmDismissed}
        />
      )}

      {/* ── AI analysis ── */}
      {(aiLoading || aiAnalysis || aiError) && selected && (
        <AIAnalysisPopup
          loading={aiLoading}
          analysis={aiAnalysis}
          error={aiError}
          pointCode={selected.code}
          gamepadConnected={gamepad.connected}
          onClose={() => { setAiAnalysis(null); setAiError(null); }}
        />
      )}

      {/* ── WhatsApp status ── */}
      {waStatus !== "idle" && (
        <div className={`absolute start-1/2 top-16 z-30 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium backdrop-blur rtl:translate-x-1/2 ${
          waStatus === "sending" ? "bg-[#151b26]/90 text-[#5b8def]" : waStatus === "sent" ? "bg-[#3fb68b]/15 text-[#3fb68b]" : "bg-[#ef5a52]/15 text-[#ef5a52]"
        }`}>
          {waStatus === "sending" ? t("assets.pipeline3d.share.sending") : waStatus === "sent" ? t("assets.pipeline3d.share.sent") : t("assets.pipeline3d.share.failed")}
        </div>
      )}

      {/* ── Canvas ── (left-to-right box: 3D labels are positioned from the left edge) */}
      <div className="absolute inset-0" dir="ltr">
      <SceneErrorBoundary
        fallback={
          <div className="flex h-full w-full items-center justify-center p-6">
            <div className="max-w-sm rounded-xl bg-[#151b26] p-4 text-center text-sm">
              <div className="mb-1 font-semibold">{t("assets.pipeline3d.scene.unavailableTitle")}</div>
              <div className="text-[#8b97a8]">{t("assets.pipeline3d.scene.unavailableBody")}</div>
            </div>
          </div>
        }
      >
        <Canvas
          camera={{ position: [SCENE_SIZE * 0.45, SCENE_SIZE * 0.42, SCENE_SIZE * 0.62], fov: 42, near: 0.1, far: 400 }}
          dpr={[1, 2]}
          shadows="percentage"
          gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(C.bg);
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <fog attach="fog" args={[C.fog, SCENE_SIZE * 1.2, SCENE_SIZE * 3.2]} />

          {/* Cool control-room lighting */}
          <hemisphereLight args={["#9fb6ff", "#0b0e14", 0.55]} />
          <directionalLight
            position={[14, 24, 12]}
            intensity={1.6}
            color="#e8eeff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={90}
            shadow-camera-left={-35}
            shadow-camera-right={35}
            shadow-camera-top={35}
            shadow-camera-bottom={-35}
          />
          <directionalLight position={[-16, 10, -10]} intensity={0.45} color={C.primary} />

          {/* Ground: satellite terrain, or the engineering grid */}
          {useMap && baseRoute.projection && baseRoute.bbox && (
            <GeoGround
              projection={baseRoute.projection}
              bbox={baseRoute.bbox}
              terrain={terrain}
              onElevation={setElevation}
              onFail={() => setGeoFailed(true)}
              onReady={() => setMapReady(true)}
            />
          )}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y - (useMap ? 0.6 : 0.01), 0]} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshStandardMaterial color={C.ground} roughness={1} metalness={0} />
          </mesh>
          {!useMap && <Grid
            position={[0, GROUND_Y, 0]}
            args={[200, 200]}
            cellSize={1}
            cellThickness={0.5}
            cellColor={C.grid}
            sectionSize={5}
            sectionThickness={1}
            sectionColor={C.section}
            fadeDistance={SCENE_SIZE * 2.4}
            fadeStrength={1.4}
            infiniteGrid
          />}

          <RoutePipe route={route} pressurePoints={shownPoints} lengthKm={pipelineLength} leakKm={hasLeak ? leakKm : null} />
          <RouteShadowLine route={route} />
          <EndCaps route={route} />

          {showFlow && <FlowParticles route={route} avgFlow={avgFlow} />}

          <KmMarkers route={route} lengthKm={pipelineLength} />

          {shownPoints.map((p, i) => (
            <PressurePointMarker
              key={p.id}
              position={pointAt(p.positionKm)}
              status={p.status}
              focused={focusedIdx === i && selectedIdx !== i}
              selected={selectedIdx === i}
              onClick={() => selectPoint(i)}
              label={labels ? { code: p.code, value: p.currentPressure !== null ? `${p.currentPressure.toFixed(1)} ${t("assets.units.bar")}` : null } : null}
            />
          ))}

          {hasLeak && <LeakIndicator position={pointAt(leakKm)} severity={leakSeverity} label={labels ? t("assets.pipeline3d.scene.leakAt", { km: kmLabel(leakKm) }) : null} />}
          {glow && <BloomEffect />}

          <CameraRig
            route={route}
            resetTick={resetTick}
            focus={focusKm !== null ? pointAt(focusKm) : null}
            autoRotate={autoRotate && !gamepad.connected}
            controlsEnabled={!gamepad.connected}
          />

          <GamepadCameraController
            leftStickX={gamepad.leftStickX}
            leftStickY={gamepad.leftStickY}
            rightStickX={gamepad.rightStickX}
            rightStickY={gamepad.rightStickY}
            l2={gamepad.l2}
            r2={gamepad.r2}
            connected={gamepad.connected}
            resetTick={resetTick}
            disableAutoRotateOnInput={() => setAutoRotate(false)}
          />
        </Canvas>
      </SceneErrorBoundary>
      </div>
    </div>
  );
}

export default Pipeline3DScene;

// ─────────────────────────────────────────────────────────
// Scene objects
// ─────────────────────────────────────────────────────────

/** The pipe: a tube along the route, vertex-coloured by pressure health. */
function RoutePipe({ route, pressurePoints, lengthKm, leakKm }: {
  route: Route; pressurePoints: PressurePoint[]; lengthKm: number; leakKm: number | null;
}) {
  const TUBULAR = 480, RADIAL = 28;
  const geometry = useMemo(() => {
    const g = new THREE.TubeGeometry(route.curve, TUBULAR, PIPE_RADIUS, RADIAL, false);
    const sensors = [...pressurePoints].sort((a, b) => a.positionKm - b.positionKm).map((p) => ({ km: p.positionKm, s: healthScore(p) }));
    const colors = new Float32Array(g.attributes.position.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i <= TUBULAR; i++) {
      healthColor(healthAt((i / TUBULAR) * lengthKm, sensors, leakKm, lengthKm), c);
      for (let j = 0; j <= RADIAL; j++) {
        const idx = (i * (RADIAL + 1) + j) * 3;
        colors[idx] = c.r; colors[idx + 1] = c.g; colors[idx + 2] = c.b;
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [route, pressurePoints, lengthKm, leakKm]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors metalness={0.7} roughness={0.32} emissive={C.primary} emissiveIntensity={0.04} />
    </mesh>
  );
}

/** Faint line on the ground under the pipe — reads like a right-of-way on a map. */
function RouteShadowLine({ route }: { route: Route }) {
  const geometry = useMemo(() => {
    const pts = route.curve.getSpacedPoints(300).map((p) => new THREE.Vector3(p.x, p.y - LIFT + 0.06, p.z));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [route]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    // eslint-disable-next-line react/no-unknown-property
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={C.primary} transparent opacity={0.35} />
    </line>
  );
}

/** Flanges + supports at both ends, oriented along the route tangent. */
function EndCaps({ route }: { route: Route }) {
  const caps = useMemo(() => [0, 1].map((u) => {
    const pos = route.curve.getPointAt(u);
    const tan = route.curve.getTangentAt(u);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
    return { pos, q, u };
  }), [route]);
  return (
    <>
      {caps.map(({ pos, q, u }) => (
        <group key={u} position={pos}>
          <mesh quaternion={q} castShadow>
            <cylinderGeometry args={[PIPE_RADIUS * 1.45, PIPE_RADIUS * 1.45, 0.35, 32]} />
            <meshStandardMaterial color={C.steelDim} metalness={0.9} roughness={0.35} />
          </mesh>
          <mesh position={[0, (GROUND_Y - 0) / 2 - 0.05, 0]} castShadow>
            <boxGeometry args={[0.5, Math.abs(GROUND_Y) - PIPE_RADIUS + 0.1, 0.5]} />
            <meshStandardMaterial color="#1c2330" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color={u === 0 ? C.primary : "#a9b4c4"} emissive={u === 0 ? C.primary : "#a9b4c4"} emissiveIntensity={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Small glowing particles travelling start → end. Speed follows the measured flow. */
function FlowParticles({ route, avgFlow }: { route: Route; avgFlow: number | null }) {
  const COUNT = 70;
  const ref = useRef<THREE.InstancedMesh>(null);
  const offsets = useMemo(() => Array.from({ length: COUNT }, (_, i) => i / COUNT), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // ~0.035 of the route per second at typical flow; clamp so it always reads as motion
  const speed = Math.min(0.09, Math.max(0.015, avgFlow ? 0.012 + (avgFlow / 1500) * 0.03 : 0.03));

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < COUNT; i++) {
      const u = (offsets[i] + t * speed) % 1;
      const p = route.curve.getPointAt(u);
      dummy.position.set(p.x, p.y + PIPE_RADIUS + 0.06, p.z);
      dummy.scale.setScalar(0.6 + 0.4 * Math.sin((u * 40 + t * 3) % (Math.PI * 2)) ** 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[0.07, 10, 10]} />
      <meshBasicMaterial color="#8fb3ff" transparent opacity={0.9} toneMapped={false} />
    </instancedMesh>
  );
}

/** Kilometre posts on the ground every "nice" interval (≤ 12 posts). */
function KmMarkers({ route, lengthKm }: { route: Route; lengthKm: number }) {
  const step = useMemo(() => {
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100];
    return candidates.find((s) => lengthKm / s <= 12) ?? 100;
  }, [lengthKm]);
  const marks = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let km = step; km < lengthKm; km += step) out.push(route.curve.getPointAt(km / lengthKm));
    return out;
  }, [route, lengthKm, step]);
  return (
    <>
      {marks.map((p, i) => (
        <group key={i} position={[p.x, p.y - LIFT, p.z]}>
          <mesh position={[0.9, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.7, 8]} />
            <meshStandardMaterial color="#a9b4c4" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0.9, 0.74, 0]}>
            <boxGeometry args={[0.22, 0.12, 0.02]} />
            <meshStandardMaterial color={C.warn} emissive={C.warn} emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Pressure transmitter on a riser, LED in the status colour, light beam when critical. */
function PressurePointMarker({ position, status, focused, selected, onClick, label }: {
  position: THREE.Vector3; status: string; focused: boolean; selected: boolean; onClick: () => void;
  label: { code: string; value: string | null } | null;
}) {
  const ledRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const color = STATUS_COLORS[status] ?? C.ok;
  const emissive = status === "CRITICAL" ? 2.6 : status === "WARNING" ? 1.7 : 0.9;
  const top = PIPE_RADIUS + 1.45;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ledRef.current) {
      const pulse = status === "CRITICAL" ? 5 : status === "WARNING" ? 3 : 0;
      ledRef.current.scale.setScalar(pulse ? 1 + Math.sin(t * pulse) * 0.18 : 1);
    }
    if (ringRef.current && (focused || selected)) {
      ringRef.current.rotation.z = t * 1.2;
      ringRef.current.scale.setScalar(0.9 + Math.sin(t * 3) * 0.08);
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, PIPE_RADIUS + 0.04, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.7]} />
        <meshStandardMaterial color={C.steelDim} metalness={0.85} roughness={0.4} />
      </mesh>
      <mesh position={[0, PIPE_RADIUS + 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.9, 12]} />
        <meshStandardMaterial color="#9aa6b8" metalness={0.95} roughness={0.25} />
      </mesh>
      <mesh position={[0, PIPE_RADIUS + 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.3, 20]} />
        <meshStandardMaterial color="#d9dee6" metalness={0.35} roughness={0.5} />
      </mesh>
      <mesh
        ref={ledRef}
        position={[0, top, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[selected ? 0.17 : 0.13, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} toneMapped={false} />
      </mesh>
      {/* Bigger invisible hit area so sensors are easy to click */}
      <mesh position={[0, top - 0.3, 0]} onClick={(e) => { e.stopPropagation(); onClick(); }} visible={false}>
        <cylinderGeometry args={[0.45, 0.45, 1.6, 8]} />
        <meshBasicMaterial />
      </mesh>
      {(focused || selected) && (
        <mesh ref={ringRef} position={[0, top, 0]}>
          <torusGeometry args={[0.36, 0.03, 8, 40]} />
          <meshBasicMaterial color={selected ? color : "#ffffff"} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
      {label && (
        <Html position={[0, top + 0.55, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-md border border-white/10 bg-[#0b0e14]/80 px-1.5 py-0.5 text-center font-mono text-[10px] leading-tight text-[#e6ebf2] backdrop-blur-sm" dir="ltr">
            <div className="font-semibold">{label.code}</div>
            {label.value && <div style={{ color }}>{label.value}</div>}
          </div>
        </Html>
      )}
      {status === "CRITICAL" && (
        <mesh position={[0, top + 2.2, 0]}>
          <cylinderGeometry args={[0.05, 0.35, 4.4, 16, 1, true]} />
          <meshBasicMaterial color={C.danger} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Leak: hot spot on the pipe, rising vapour, beacon and expanding ground ring. */
function LeakIndicator({ position, severity, label }: { position: THREE.Vector3; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; label: string | null }) {
  const beaconRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const plumes = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const intensity = severity === "CRITICAL" ? 3.5 : severity === "HIGH" ? 2.6 : severity === "MEDIUM" ? 1.8 : 1.1;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (beaconRef.current) {
      beaconRef.current.scale.setScalar(1 + Math.sin(t * 5) * 0.22);
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(t * 5) * 1.4;
    }
    if (ringRef.current) {
      const r = (t * 1.2) % 2;
      ringRef.current.scale.setScalar(1 + r * 1.6);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - r / 2);
    }
    plumes.forEach((p, i) => {
      if (!p.current) return;
      const phase = (t * 0.8 + i * 0.6) % 2.4;
      p.current.position.y = PIPE_RADIUS + 0.2 + phase * 1.5;
      p.current.position.x = Math.sin(t * 0.7 + i) * 0.15 * phase;
      (p.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - phase / 2.4);
      p.current.scale.setScalar(0.35 + phase * 0.4);
    });
  });

  return (
    <group position={position}>
      <mesh position={[0, PIPE_RADIUS * 0.6, 0]}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshStandardMaterial color="#ffd08a" emissive="#ff6a2a" emissiveIntensity={intensity} toneMapped={false} />
      </mesh>
      {plumes.map((r, i) => (
        <mesh key={i} ref={r} position={[0, PIPE_RADIUS + 0.2, 0]}>
          <sphereGeometry args={[0.34, 14, 14]} />
          <meshBasicMaterial color="#b9c2cf" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.6, 10]} />
        <meshStandardMaterial color="#1c2330" metalness={0.7} roughness={0.4} />
      </mesh>
      {label && (
        <Html position={[0, 4.1, 0]} center zIndexRange={[16, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-md bg-[#c2413b] px-2 py-0.5 text-[11px] font-semibold text-white shadow-lg">{label}</div>
        </Html>
      )}
      <mesh ref={beaconRef} position={[0, 3.3, 0]}>
        <sphereGeometry args={[0.24, 20, 20]} />
        <meshStandardMaterial color={C.danger} emissive={C.danger} emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.03, 0]}>
        <ringGeometry args={[0.8, 1.05, 48]} />
        <meshBasicMaterial color={C.danger} transparent opacity={0.5} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.02, 0]}>
        <circleGeometry args={[0.8, 48]} />
        <meshBasicMaterial color={C.danger} transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

/**
 * Orbit controls + framing: frames the whole route on load/reset, glides to a
 * sensor or the leak when one is chosen.
 */
function CameraRig({ route, resetTick, focus, autoRotate, controlsEnabled }: {
  route: Route; resetTick: number; focus: THREE.Vector3 | null; autoRotate: boolean; controlsEnabled: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Pull back on narrow (portrait) screens so the whole route fits
  const aspect = size.width / Math.max(size.height, 1);
  const overview = useCallback(() => {
    const d = Math.max(route.span, 10) / Math.min(1, Math.max(aspect, 0.45));
    return { pos: new THREE.Vector3(d * 0.42, d * 0.5, d * 0.72), target: new THREE.Vector3(0, 0, 0) };
  }, [route, aspect]);

  useEffect(() => { goal.current = overview(); }, [overview, resetTick]);

  useEffect(() => {
    if (!focus) return;
    const dir = camera.position.clone().sub(controls.current?.target ?? new THREE.Vector3()).setY(0).normalize();
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 1).normalize();
    goal.current = { pos: focus.clone().add(dir.multiplyScalar(7)).setY(focus.y + 4.5), target: focus.clone() };
  }, [focus, camera]);

  useFrame((_s, delta) => {
    const c = controls.current;
    if (!c || !goal.current) return;
    const k = 1 - Math.exp(-delta * 3.5);
    camera.position.lerp(goal.current.pos, k);
    c.target.lerp(goal.current.target, k);
    c.update();
    if (camera.position.distanceTo(goal.current.pos) < 0.05 && c.target.distanceTo(goal.current.target) < 0.05) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={controlsEnabled}
      enablePan
      screenSpacePanning={false}
      autoRotate={autoRotate}
      autoRotateSpeed={0.35}
      minDistance={3}
      maxDistance={(Math.max(route.span, 10) * 2.4) / Math.min(1, Math.max(aspect, 0.45))}
      maxPolarAngle={Math.PI / 2.08}
      onStart={() => { goal.current = null; }}
    />
  );
}

// ─────────────────────────────────────────────────────────
// PS5 / Xbox controller — drives camera inside the Canvas
// ─────────────────────────────────────────────────────────
function GamepadCameraController({
  leftStickX, leftStickY, rightStickX, rightStickY, l2, r2, connected, resetTick, disableAutoRotateOnInput,
}: {
  leftStickX: number; leftStickY: number; rightStickX: number; rightStickY: number;
  l2: number; r2: number; connected: boolean; resetTick: number; disableAutoRotateOnInput: () => void;
}) {
  const { camera } = useThree();
  const sphericalRef = useRef(new THREE.Spherical());
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => { sphericalRef.current.setFromVector3(camera.position); }, [camera, connected]);
  useEffect(() => { if (resetTick) { targetRef.current.set(0, 0, 0); sphericalRef.current.setFromVector3(camera.position); } }, [resetTick, camera]);

  useFrame((_state, delta) => {
    if (!connected) return;
    const sph = sphericalRef.current;
    const dt = Math.min(delta, 0.05);
    const dz = (v: number) => (Math.abs(v) > 0.08 ? v : 0);
    const lx = dz(leftStickX), ly = dz(leftStickY), rx = dz(rightStickX), ry = dz(rightStickY);
    if (lx || ly) {
      sph.theta -= lx * 2.2 * dt;
      sph.phi = Math.max(0.25, Math.min(Math.PI / 2.05, sph.phi - ly * 2.2 * dt));
      disableAutoRotateOnInput();
    }
    if (rx || ry) {
      const t = targetRef.current;
      t.x = Math.max(-SCENE_SIZE * 0.7, Math.min(SCENE_SIZE * 0.7, t.x + rx * 10 * dt));
      t.z = Math.max(-SCENE_SIZE * 0.7, Math.min(SCENE_SIZE * 0.7, t.z + ry * 10 * dt));
      disableAutoRotateOnInput();
    }
    const zIn = l2 > 0.05 ? l2 : 0, zOut = r2 > 0.05 ? r2 : 0;
    if (zIn || zOut) {
      sph.radius = Math.max(4, Math.min(SCENE_SIZE * 2, sph.radius + (zOut - zIn) * 22 * dt));
      disableAutoRotateOnInput();
    }
    camera.position.copy(new THREE.Vector3().setFromSpherical(sph).add(targetRef.current));
    camera.lookAt(targetRef.current);
  });

  return null;
}

// ─────────────────────────────────────────────────────────
// Overlays
// ─────────────────────────────────────────────────────────
function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-white/[0.08] bg-[#11161f]/85 shadow-lg backdrop-blur-md ${className}`}>{children}</div>;
}

function OverlayButton({ onClick, icon: Icon, label, light }: {
  onClick: () => void; icon: typeof Play; label: string; light?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs backdrop-blur transition-colors ${
        light ? "bg-white/15 text-white hover:bg-white/25" : "border border-white/[0.08] bg-[#11161f]/85 text-[#e6ebf2] hover:bg-[#1a2230]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function PressureGauge({ current, min, max, unit }: { current: number | null; min: number; max: number; unit: string }) {
  const lo = min - (max - min) * 0.25, hi = max + (max - min) * 0.25;  // show the limits inside the dial
  const pct = current !== null && hi > lo ? Math.min(1, Math.max(0, (current - lo) / (hi - lo))) : 0;
  const R = 42, cx = 60, cy = 58, start = 200, sweep = 140;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (a: number) => ({ x: cx + R * Math.cos(toRad(a)), y: cy + R * Math.sin(toRad(a)) });
  const arc = (from: number, sw: number) => {
    const s = pt(from), e = pt(from + sw);
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${sw > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  };
  const safeFrom = start + sweep * ((min - lo) / (hi - lo));
  const safeSweep = sweep * ((max - min) / (hi - lo));
  const color = current === null ? "#6b7280" : current < min || current > max ? C.danger : pct > 0.75 || pct < 0.25 ? C.warn : C.ok;
  return (
    <svg viewBox="0 0 120 76" className="w-full" style={{ maxHeight: 84, direction: "ltr" }}>
      <path d={arc(start, sweep)} fill="none" stroke="#232b38" strokeWidth="8" strokeLinecap="round" />
      <path d={arc(safeFrom, safeSweep)} fill="none" stroke={C.ok} strokeOpacity="0.25" strokeWidth="8" />
      {current !== null && <path d={arc(start, sweep * pct)} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />}
      <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="15" fontFamily="ui-monospace, monospace" fontWeight="700">
        {current !== null ? current.toFixed(1) : "—"}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" fill="#8b97a8" fontSize="7">{unit}</text>
    </svg>
  );
}

function SensorHUD({ point, index, total, gamepadConnected, sharing, onAnalyze, onShare, onClose, kmLabel, topOffset }: {
  point: PressurePoint; index: number; total: number; gamepadConnected: boolean; sharing: boolean;
  onAnalyze: () => void; onShare: () => void; onClose: () => void; kmLabel: (n: number) => string; topOffset: boolean | null;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const statusColor = STATUS_COLORS[point.status] ?? C.ok;
  const noReading = t("assets.pipeline3d.hud.noReading");
  return (
    <Panel className={`absolute end-3 z-20 w-72 overflow-hidden ${topOffset ? "top-32" : "top-24"}`}>
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="font-mono text-sm font-semibold">{point.code}</span>
        </span>
        <span className="flex items-center gap-2 text-[11px] text-[#8b97a8]">
          {t("assets.pipeline3d.hud.counter", { i: index + 1, n: total })}
          <button type="button" onClick={onClose} aria-label={t("assets.pipeline3d.hud.close")} className="rounded p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      <div className="px-4 pt-2">
        <PressureGauge current={point.currentPressure} min={point.expectedMin} max={point.expectedMax} unit={t("assets.units.bar")} />
      </div>
      <div className="space-y-1 px-3 pb-2 text-xs">
        <Row label={t("assets.pipeline3d.hud.position")} value={kmLabel(point.positionKm)} />
        <Row label={t("assets.pipeline3d.hud.safeRange")} value={`${point.expectedMin} – ${point.expectedMax} ${t("assets.units.bar")}`} />
        <Row label={t("assets.pipeline3d.hud.flow")} value={point.currentFlow !== null ? `${point.currentFlow.toFixed(0)} ${t("assets.units.flow")}` : noReading} />
        <Row label={t("assets.pipeline3d.hud.temperature")} value={point.currentTemp !== null ? `${point.currentTemp.toFixed(1)} ${t("assets.units.celsius")}` : noReading} />
        <div className="flex items-center justify-between">
          <span className="text-[#8b97a8]">{t("assets.pipeline3d.hud.status")}</span>
          <span className="font-semibold" style={{ color: statusColor }}>{f.enum("status", point.status)}</span>
        </div>
      </div>
      <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1.5 font-mono text-[11px] text-[#8b97a8]" dir="ltr">
        <MapPin className="h-3 w-3" /> {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] p-2">
        <button type="button" onClick={onAnalyze} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#5b8def] px-2 py-1.5 text-xs font-medium text-[#0b0e14] hover:bg-[#6f9cf2]">
          <Brain className="h-3.5 w-3.5" /> {t("assets.pipeline3d.hud.analyze")}
        </button>
        <button type="button" onClick={onShare} disabled={sharing} className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1.5 text-xs hover:bg-white/[0.1] disabled:opacity-50">
          {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} {t("assets.pipeline3d.hud.share")}
        </button>
      </div>
      {gamepadConnected && (
        <div className="grid grid-cols-4 gap-1 border-t border-white/[0.08] px-3 py-1.5 text-[10px] text-[#8b97a8]">
          {([["◄►", "navigate"], ["✕", "close"], ["TP", "ai"], ["R1", "whatsapp"]] as const).map(([btn, key]) => (
            <span key={btn} className="flex flex-col items-center gap-0.5">
              <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono">{btn}</kbd>
              <span>{t(`assets.pipeline3d.gamepad.${key}`)}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#8b97a8]">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function AIAnalysisPopup({ loading, analysis, error, pointCode, gamepadConnected, onClose }: {
  loading: boolean; analysis: PointAnalysis | null; error: string | null; pointCode: string; gamepadConnected: boolean; onClose: () => void;
}) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const riskColor = analysis ? (RISK_COLORS[analysis.risk] ?? "#6b7280") : "#6b7280";
  const summary = analysis ? (isAr && analysis.summaryAr ? analysis.summaryAr : analysis.summary) : "";
  const actions = analysis ? (isAr && analysis.recommendationsAr?.length ? analysis.recommendationsAr : analysis.recommendations) : [];
  const trendKey = `assets.pipeline3d.trend.${analysis?.trend ?? "UNKNOWN"}` as MessageKey;
  const trendLabel = t(trendKey) === trendKey ? t("assets.pipeline3d.trend.UNKNOWN") : t(trendKey);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 mx-auto max-w-md px-3 pb-3">
      <Panel className="pointer-events-auto overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Brain className="h-3.5 w-3.5 text-[#5b8def]" /> {t("assets.pipeline3d.ai.title", { code: pointCode })}
          </span>
          <button type="button" onClick={onClose} aria-label={t("assets.pipeline3d.hud.close")} className="rounded p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
        </div>
        {loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-xs text-[#8b97a8]">
            <Loader2 className="h-5 w-5 animate-spin text-[#5b8def]" /> {t("assets.pipeline3d.ai.analyzing")}
          </div>
        )}
        {error && !loading && <div className="px-4 py-4 text-xs text-[#ef5a52]">{error}</div>}
        {analysis && !loading && (
          <div className="space-y-2.5 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: riskColor, backgroundColor: `${riskColor}22` }}>
                {t("assets.pipeline3d.ai.risk", { level: f.enum("severity", analysis.risk) })}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[#8b97a8]">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${analysis.confidence * 100}%`, backgroundColor: riskColor }} />
                </span>
                {t("assets.pipeline3d.ai.confidence", { n: (analysis.confidence * 100).toFixed(0) })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8b97a8]">
              <Activity className="h-3.5 w-3.5" /> {trendLabel}
              {analysis.maintenanceFlag && (
                <span className="flex items-center gap-1 rounded-full bg-[#e5a53b]/15 px-2 py-px text-[#e5a53b]">
                  <Wrench className="h-3 w-3" /> {t("assets.pipeline3d.ai.maintenance")}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed" dir="auto">{summary}</p>
            {actions.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] text-[#8b97a8]">{t("assets.pipeline3d.ai.actions")}</div>
                <ul className="space-y-1">
                  {actions.slice(0, 4).map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs" dir="auto">
                      <span className="mt-px shrink-0 text-[#5b8def]">•</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {gamepadConnected && !loading && (
          <div className="border-t border-white/[0.08] px-3 py-1 text-center text-[10px] text-[#8b97a8]">{t("assets.pipeline3d.ai.closeHint")}</div>
        )}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Satellite terrain
// ─────────────────────────────────────────────────────────
interface GeoTile { key: string; texture: THREE.Texture; range: TileRange; x: number; y: number }

/**
 * Loads elevation (once) and satellite imagery tiles for the area, and draws
 * one displaced plane per imagery tile. Hands the elevation sampler back so the
 * pipe can follow the same ground.
 */
function GeoGround({ projection, bbox, terrain, onElevation, onFail, onReady }: {
  projection: Projection; bbox: BBox; terrain: Terrain | null;
  onElevation: (e: ElevationSampler) => void; onFail: () => void; onReady: () => void;
}) {
  const [tiles, setTiles] = useState<GeoTile[]>([]);
  const { gl } = useThree();

  useEffect(() => {
    const ctrl = new AbortController();
    const imgRange = pickTiles(bbox, 16, 13);
    const elevRange = pickTiles(bbox, 9, Math.min(imgRange.z, 11));
    loadElevation(elevRange, ctrl.signal).then(onElevation).catch((e) => { if (e?.name !== "AbortError") onFail(); });

    const jobs: Promise<GeoTile>[] = [];
    for (let x = imgRange.x0; x <= imgRange.x1; x++) for (let y = imgRange.y0; y <= imgRange.y1; y++) {
      jobs.push(loadImage(IMAGERY_URL(imgRange.z, x, y), ctrl.signal).then((img) => {
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        return { key: `${imgRange.z}/${x}/${y}`, texture, range: imgRange, x, y };
      }));
    }
    Promise.all(jobs).then((t) => { setTiles(t); onReady(); }).catch((e) => { if (e?.name !== "AbortError") onFail(); });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox, gl]);

  useEffect(() => () => tiles.forEach((tl) => tl.texture.dispose()), [tiles]);

  return (
    <>
      {tiles.map((tl) => <GeoTileMesh key={tl.key} tile={tl} projection={projection} terrain={terrain} />)}
    </>
  );
}

function GeoTileMesh({ tile, projection, terrain }: { tile: GeoTile; projection: Projection; terrain: Terrain | null }) {
  const SEG = 40;
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, SEG, SEG);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const { z } = tile.range;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      // The tile is linear in Web-Mercator space: interpolate there, then project
      const lng = tileXToLng(tile.x + u, z);
      const lat = tileYToLat(tile.y + (1 - v), z);
      const { x, z: sz } = projection.toScene(lat, lng);
      pos.setXYZ(i, x, terrain ? terrain.groundAt(x, sz) : GROUND_Y, sz);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [tile, projection, terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={tile.texture} roughness={1} metalness={0} side={THREE.DoubleSide} color="#9aa5b5" />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────
// Glow (bloom) — only bright, un-tone-mapped colours bloom
// ─────────────────────────────────────────────────────────
function BloomEffect() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.7, 0.5, 0.9));
    c.addPass(new OutputPass());
    return c;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  useEffect(() => { composer.setSize(size.width, size.height); composer.setPixelRatio(gl.getPixelRatio()); }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);   // priority > 0 → takes over rendering
  return null;
}

// ─────────────────────────────────────────────────────────
// Pressure history (timeline)
// ─────────────────────────────────────────────────────────
interface PressureHistory {
  from: number;
  to: number;
  byCode: Map<string, { t: number; pressure: number; flow: number | null; temp: number | null; status: string }[]>;
}

function usePressureHistory(pipelineId: string): PressureHistory | null {
  const [history, setHistory] = useState<PressureHistory | null>(null);
  useEffect(() => {
    let alive = true;
    // Last 24 h; if the line has been quiet, fall back to its latest 24 h of readings (up to 90 days back)
    const get = (hours: number) => fetch(`/api/pipelines/${pipelineId}/readings?hours=${hours}`).then((r) => r.json());
    get(24)
      .then((j) => (j?.ok && j.data.series.some((x: { readings: unknown[] }) => x.readings.length) ? j : get(24 * 90)))
      .then((j) => {
        if (!alive || !j?.ok) return;
        const byCode: PressureHistory["byCode"] = new Map();
        let from = Infinity, to = -Infinity;
        for (const s of j.data.series as { code: string; readings: { time: string; pressure: number; flowRate: number | null; temperature: number | null; status: string }[] }[]) {
          const rows = s.readings.map((r) => ({ t: new Date(r.time).getTime(), pressure: r.pressure, flow: r.flowRate, temp: r.temperature, status: r.status }));
          rows.forEach((r) => { from = Math.min(from, r.t); to = Math.max(to, r.t); });
          if (rows.length) byCode.set(s.code, rows);
        }
        from = Math.max(from, to - 24 * 3600_000);   // show one day, ending at the latest reading
        // A timeline needs at least two moments to scrub between
        if (byCode.size && to - from > 60_000) setHistory({ from, to, byCode });
      })
      .catch(() => { /* no history → no timeline */ });
    return () => { alive = false; };
  }, [pipelineId]);
  return history;
}

/** Sensor values as they were at time t (latest reading at or before t). */
function pointsAt(points: PressurePoint[], h: PressureHistory, t: number): PressurePoint[] {
  return points.map((p) => {
    const rows = h.byCode.get(p.code);
    if (!rows) return { ...p, currentPressure: null, currentFlow: null, currentTemp: null, status: "NORMAL" };
    let row = null;
    for (const r of rows) { if (r.t <= t) row = r; else break; }
    if (!row) return { ...p, currentPressure: null, currentFlow: null, currentTemp: null, status: "NORMAL" };
    return { ...p, currentPressure: row.pressure, currentFlow: row.flow, currentTemp: row.temp, status: row.status };
  });
}

function TimelineBar({ history, timeAt, playing, onChange, onPlay, onLive }: {
  history: PressureHistory; timeAt: number | null; playing: boolean;
  onChange: (t: number) => void; onPlay: () => void; onLive: () => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const value = timeAt ?? history.to;
  return (
    <Panel className="absolute bottom-16 start-1/2 z-20 flex w-[min(30rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 px-3 py-2 rtl:translate-x-1/2 sm:bottom-3">
      <History className="h-4 w-4 shrink-0 text-[#5b8def]" />
      <button type="button" onClick={onPlay} aria-label={playing ? t("assets.pipeline3d.timeline.pause") : t("assets.pipeline3d.timeline.play")}
        className="rounded-md p-1 hover:bg-white/10">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={history.from}
        max={history.to}
        step={(history.to - history.from) / 240}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t("assets.pipeline3d.timeline.label")}
        className="h-1 flex-1 cursor-pointer accent-[#5b8def]"
        dir="ltr"
      />
      <span className="w-28 shrink-0 text-center font-mono text-[11px] text-[#8b97a8]">
        {timeAt === null ? t("assets.pipeline3d.timeline.live") : f.dateTime(new Date(value))}
      </span>
      {timeAt !== null && (
        <button type="button" onClick={onLive} className="shrink-0 rounded-md bg-[#5b8def]/20 px-2 py-0.5 text-[11px] text-[#5b8def] hover:bg-[#5b8def]/30">
          {t("assets.pipeline3d.timeline.backToLive")}
        </button>
      )}
    </Panel>
  );
}
