"use client";

/**
 * Pipeline 3D Scene — industrial / SCADA-style visualization.
 * Simplified for reliability: no Html, no Line, no buffer-attribute particles.
 * Wraps Canvas in an error boundary so silent Three.js failures surface to the user.
 */
import { useRef, useState, useEffect, useCallback, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sphere, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import { useGamepadControls } from "./useGamepadControls";

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

// AI analysis result shape
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

const SCENE_LENGTH = 30;
const PIPELINE_RADIUS = 0.5;

const STATUS_COLORS: Record<string, string> = {
  NORMAL: "#10b981",
  WARNING: "#f59e0b",
  CRITICAL: "#ef4444",
};

// ─────────────────────────────────────────────────────────
// Error boundary — surfaces silent Three.js failures
// ─────────────────────────────────────────────────────────
class SceneErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error("[Pipeline3D]", err); }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#0a0f1c] p-6">
          <div className="max-w-md rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="mb-1 font-semibold">3D scene failed to render</div>
            <div className="font-mono text-xs opacity-80">{this.state.err.message}</div>
            <div className="mt-2 text-xs opacity-60">Check browser console for full stack trace.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
  const [focusedIdx,      setFocusedIdx]       = useState<number | null>(null); // D-pad cursor
  const [selectedIdx,     setSelectedIdx]      = useState<number | null>(null); // confirmed open
  const [autoRotate,      setAutoRotate]       = useState(false);
  const [resetTick,       setResetTick]        = useState(0);
  const [aiAnalysis,      setAiAnalysis]       = useState<PointAnalysis | null>(null);
  const [aiLoading,       setAiLoading]        = useState(false);
  const [aiError,         setAiError]          = useState<string | null>(null);
  const [waStatus,        setWaStatus]         = useState<"idle" | "sending" | "sent" | "error">("idle");

  // ── Alarm system ──────────────────────────────────────────
  const [alarmMuted,    setAlarmMuted]    = useState(false);
  const [alarmDismissed,setAlarmDismissed]= useState(false);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const alarmLoopRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const waSentAlarmRef= useRef(false); // send WA only once per alarm session

  // Determine alarm level from live data
  const criticalPts = pressurePoints.filter((p) => p.status === "CRITICAL");
  const warningPts  = pressurePoints.filter((p) => p.status === "WARNING");
  const alarmLevel  = hasLeak ? "LEAK"
    : criticalPts.length > 0 ? "CRITICAL"
    : warningPts.length  > 0 ? "WARNING"
    : null;

  /**
   * Professional SCADA-grade alarm tone.
   *
   * LEAK / CRITICAL → Triple-pulse klaxon (IEC 60849 / ISO 7731 style):
   *   Three sharp 880 Hz square-wave pulses (120 ms on / 80 ms off),
   *   then silence before the next group — sounds like a real control-room alarm.
   *
   * WARNING → Single measured 660 Hz pulse every interval:
   *   One clean 300 ms tone with fast attack / soft tail.
   */
  const playSirenWoop = useCallback((level: string) => {
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
        // Band-pass filter — removes harsh high harmonics, more "industrial monitor" than toy
        const bpf = ctx.createBiquadFilter();
        bpf.type = "bandpass";
        bpf.frequency.value = freq;
        bpf.Q.value = 1.2;

        o.type = "square";
        o.frequency.value = freq;
        o.connect(bpf);
        bpf.connect(g);
        g.connect(ctx.destination);

        // Sharp attack (2 ms), flat sustain, short tail (15 ms) — clean and precise
        g.gain.setValueAtTime(0, startAt);
        g.gain.linearRampToValueAtTime(vol, startAt + 0.002);
        g.gain.setValueAtTime(vol, startAt + duration - 0.015);
        g.gain.linearRampToValueAtTime(0, startAt + duration);

        o.start(startAt);
        o.stop(startAt + duration + 0.005);
      };

      if (level === "LEAK" || level === "CRITICAL") {
        // Triple-pulse klaxon at 880 Hz — 3 × (120 ms on + 80 ms off)
        beep(now + 0.00, 880, 0.12, 0.22);
        beep(now + 0.20, 880, 0.12, 0.22);
        beep(now + 0.40, 880, 0.12, 0.22);
      } else {
        // Single measured pulse at 660 Hz — 300 ms
        beep(now + 0.00, 660, 0.30, 0.16);
      }
    } catch { /* AudioContext requires user gesture — silently skip */ }
  }, []);

  /** Start / stop the repeating siren loop */
  useEffect(() => {
    if (!alarmLevel || alarmMuted || alarmDismissed) {
      if (alarmLoopRef.current) { clearInterval(alarmLoopRef.current); alarmLoopRef.current = null; }
      return;
    }
    // Play immediately then loop
    playSirenWoop(alarmLevel);
    // Triple-pulse total = ~600 ms + 2400 ms silence = 3 s groups
    // Warning single pulse = 300 ms + 3700 ms silence = 4 s
    const interval = alarmLevel === "LEAK" || alarmLevel === "CRITICAL" ? 3000 : 4000;
    alarmLoopRef.current = setInterval(() => playSirenWoop(alarmLevel), interval);

    return () => {
      if (alarmLoopRef.current) { clearInterval(alarmLoopRef.current); alarmLoopRef.current = null; }
    };
  }, [alarmLevel, alarmMuted, alarmDismissed, playSirenWoop]);

  /** Auto-send WhatsApp once when alarm first fires */
  useEffect(() => {
    if (!alarmLevel || alarmDismissed || waSentAlarmRef.current) return;

    const affectedCodes = [
      ...criticalPts.map((p) => p.code),
      ...warningPts.map((p)  => p.code),
    ].join(", ") || "—";

    const icon = alarmLevel === "LEAK" ? "🚨" : alarmLevel === "CRITICAL" ? "🔴" : "⚠️";
    const msg  =
`${icon} AEGIS ALARM — ${alarmLevel === "LEAK" ? "LEAK DETECTED" : alarmLevel + " PRESSURE"}
━━━━━━━━━━━━━━━━━━━━
🛢️ Pipeline: ${pipelineName}${hasLeak ? `\n📍 Leak at: km ${leakKm.toFixed(1)} (${leakSeverity})` : ""}
⚡ Affected sensors: ${affectedCodes}
${criticalPts.map((p) =>
  `• ${p.code} @ km ${p.positionKm.toFixed(1)}: ${p.currentPressure?.toFixed(1) ?? "?"} bar (safe: ${p.expectedMin}–${p.expectedMax})`
).join("\n")}
━━━━━━━━━━━━━━━━━━━━
🔴 IMMEDIATE ACTION REQUIRED
🤖 AEGIS Auto-Alert`;

    waSentAlarmRef.current = true;
    fetch("/api/notify/whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body:    JSON.stringify({ message: msg }),
    }).catch(() => { /* best-effort */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmLevel]);

  // Reset sent flag when alarm clears
  useEffect(() => {
    if (!alarmLevel) { waSentAlarmRef.current = false; setAlarmDismissed(false); }
  }, [alarmLevel]);

  const gamepad = useGamepadControls();

  // Stop auto-rotate the moment a gamepad connects
  useEffect(() => {
    if (gamepad.connected) setAutoRotate(false);
  }, [gamepad.connected]);

  // ◯ — toggle auto-rotate
  useEffect(() => {
    if (gamepad.circle) setAutoRotate((v) => !v);
  }, [gamepad.circle]);

  // △ — reset camera + clear everything
  useEffect(() => {
    if (gamepad.triangle) {
      setResetTick((t) => t + 1);
      setAutoRotate(false);
      setFocusedIdx(null);
      setSelectedIdx(null);
      setAiAnalysis(null);
    }
  }, [gamepad.triangle]);

  // D-pad ← / → — move focus cursor (does NOT open HUD)
  useEffect(() => {
    if (pressurePoints.length === 0) return;
    if (gamepad.dpadRight) {
      setFocusedIdx((prev) => prev === null ? 0 : (prev + 1) % pressurePoints.length);
    }
    if (gamepad.dpadLeft) {
      setFocusedIdx((prev) => prev === null ? pressurePoints.length - 1
                                             : (prev - 1 + pressurePoints.length) % pressurePoints.length);
    }
  }, [gamepad.dpadLeft, gamepad.dpadRight, pressurePoints.length]);

  // ✕ (Cross) — CONFIRM: open focused sensor / close open HUD
  useEffect(() => {
    if (!gamepad.cross) return;
    // If AI popup is open → close it first
    if (aiAnalysis || aiError) { setAiAnalysis(null); setAiError(null); return; }
    // If HUD is open → close it
    if (selectedIdx !== null) { setSelectedIdx(null); return; }
    // If a sensor is focused → open its HUD
    if (focusedIdx !== null) { setSelectedIdx(focusedIdx); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.cross]);

  // □ (Square) — close AI popup or HUD
  useEffect(() => {
    if (!gamepad.square) return;
    if (aiAnalysis || aiError) { setAiAnalysis(null); setAiError(null); }
    else setSelectedIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.square]);

  // TOUCHPAD — trigger AI analysis for selected point
  useEffect(() => {
    if (!gamepad.touchpad) return;
    if (selectedIdx === null) return;
    const pt = pressurePoints[selectedIdx];
    if (!pt || !pipelineId) return;
    if (aiLoading) return;

    // If popup already open → close it (toggle)
    if (aiAnalysis) { setAiAnalysis(null); setAiError(null); return; }

    setAiLoading(true);
    setAiError(null);
    fetch(`/api/pipelines/${pipelineId}/point-analysis`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body:    JSON.stringify({ pointCode: pt.code }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAiAnalysis(d.data.analysis);
        else      setAiError(d.error?.message || "Analysis failed");
      })
      .catch(() => setAiError("Network error — check connection"))
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.touchpad]);

  // R1 — send WhatsApp with full sensor details
  useEffect(() => {
    if (!gamepad.r1) return;
    if (selectedIdx === null) return;
    const pt = pressurePoints[selectedIdx];
    if (!pt) return;
    if (waStatus === "sending") return;

    const status  = pt.status === "NORMAL" ? "✅ NORMAL" : pt.status === "WARNING" ? "⚠️ WARNING" : "🚨 CRITICAL";
    const message =
`🛢️ AEGIS Pipeline Sensor Report
━━━━━━━━━━━━━━━━━━━━
📍 Pipeline: ${pipelineName}
🔩 Sensor: ${pt.code}
📏 Position: km ${pt.positionKm.toFixed(1)}
${status} Status: ${pt.status}
━━━━━━━━━━━━━━━━━━━━
📊 Live Readings:
• Pressure: ${pt.currentPressure !== null ? pt.currentPressure.toFixed(1) + " bar" : "No data"}
  (Safe range: ${pt.expectedMin}–${pt.expectedMax} bar)
• Flow rate: ${pt.currentFlow !== null ? pt.currentFlow.toFixed(0) + " m³/h" : "N/A"}
• Temperature: ${pt.currentTemp !== null ? pt.currentTemp.toFixed(1) + " °C" : "N/A"}
━━━━━━━━━━━━━━━━━━━━
🌍 GPS Location:
Lat: ${pt.latitude.toFixed(6)}
Lng: ${pt.longitude.toFixed(6)}
Maps: https://maps.google.com/?q=${pt.latitude.toFixed(6)},${pt.longitude.toFixed(6)}
━━━━━━━━━━━━━━━━━━━━
🤖 Sent via AEGIS 3D Control`;

    setWaStatus("sending");
    fetch("/api/notify/whatsapp", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body:    JSON.stringify({ message }),
    })
      .then((r) => r.json())
      .then((d) => setWaStatus(d.ok ? "sent" : "error"))
      .catch(() => setWaStatus("error"))
      .finally(() => setTimeout(() => setWaStatus("idle"), 4000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad.r1]);

  const kmToX = (km: number) =>
    pipelineLength > 0 ? (km / pipelineLength) * SCENE_LENGTH - SCENE_LENGTH / 2 : 0;

  const selected = selectedIdx !== null ? pressurePoints[selectedIdx] : null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border/40 bg-[#0a0f1c]">
      {/* Top overlays */}
      <div className="absolute left-3 top-3 z-10 flex w-[calc(100%-1.5rem)] items-start justify-between gap-3">
        <div className="rounded-md border border-primary/20 bg-background/70 px-3 py-1.5 backdrop-blur">
          <div className="text-[10px] uppercase tracking-widest text-primary">Pipeline</div>
          <div className="font-mono text-sm font-semibold">{pipelineName}</div>
          <div className="text-[10px] text-muted-foreground">{pipelineLength.toFixed(1)} km</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className="rounded-md border border-border/40 bg-background/70 px-3 py-1.5 text-xs backdrop-blur transition-colors hover:bg-background/90"
          >
            {autoRotate ? "⏸ Pause rotation" : "▶ Resume rotation"}
          </button>
          {hasLeak && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive backdrop-blur">
              ⚠ LEAK · km {leakKm.toFixed(1)} · {leakSeverity}
            </div>
          )}
        </div>
      </div>

      {/* Pressure point list */}
      <div className="absolute bottom-3 left-3 z-10 max-h-[60%] w-60 overflow-y-auto rounded-md border border-border/40 bg-background/88 p-2 backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
          <span>Pressure Points ({pressurePoints.length})</span>
          {gamepad.connected && (
            <span className="text-primary/60">◄ ► navigate · ✕ open</span>
          )}
        </div>
        <div className="space-y-0.5">
          {pressurePoints.map((p, i) => {
            const color      = STATUS_COLORS[p.status] ?? STATUS_COLORS.NORMAL;
            const isFocused  = focusedIdx === i;
            const isSelected = selectedIdx === i;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setFocusedIdx(i);
                  setSelectedIdx(isSelected ? null : i);
                }}
                className={`relative flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-all ${
                  isSelected
                    ? "bg-primary/20 border border-primary/40"
                    : isFocused
                    ? "bg-white/8 border border-white/20"
                    : "border border-transparent hover:bg-muted/30"
                }`}
              >
                {/* D-pad cursor indicator */}
                {isFocused && !isSelected && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-0.5 text-[10px] text-white/80">▶</span>
                )}
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${p.status === "CRITICAL" ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-mono font-medium">{p.code}</span>
                  {isSelected && <span className="text-[9px] text-primary">●</span>}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  {p.currentPressure !== null && (
                    <span style={{ color }}>{p.currentPressure.toFixed(0)}</span>
                  )}
                  <span>{p.positionKm.toFixed(1)} km</span>
                </span>
              </button>
            );
          })}
          {pressurePoints.length === 0 && (
            <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
              No pressure points configured
            </div>
          )}
        </div>
      </div>

      {/* ── Professional HUD card ── */}
      {selected && !aiAnalysis && !aiLoading && (
        <SensorHUD
          point={selected}
          index={selectedIdx!}
          total={pressurePoints.length}
          gamepadConnected={gamepad.connected}
          onClose={() => setSelectedIdx(null)}
        />
      )}

      {/* ── AI Analysis Popup (touchpad) ── */}
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

      {/* ══════════════════════════════════════════════════
           ── ALARM OVERLAY ──
           Appears on LEAK / CRITICAL / WARNING
      ══════════════════════════════════════════════════ */}
      {alarmLevel && !alarmDismissed && (
        <div className={`absolute inset-0 z-30 pointer-events-none`}>
          {/* Pulsing border glow */}
          <div className={`absolute inset-0 rounded-lg border-2 animate-pulse ${
            alarmLevel === "LEAK" || alarmLevel === "CRITICAL"
              ? "border-red-500/70 shadow-[inset_0_0_40px_rgba(239,68,68,0.25)]"
              : "border-amber-400/60 shadow-[inset_0_0_40px_rgba(251,191,36,0.15)]"
          }`} />

          {/* Top alarm banner */}
          <div className={`pointer-events-auto absolute top-0 left-0 right-0 flex items-center justify-between gap-3 px-4 py-2 ${
            alarmLevel === "LEAK" || alarmLevel === "CRITICAL"
              ? "bg-red-600/90"
              : "bg-amber-500/90"
          } backdrop-blur`}>
            <div className="flex items-center gap-2">
              <span className="text-sm animate-pulse">
                {alarmLevel === "LEAK" ? "🚨" : alarmLevel === "CRITICAL" ? "🔴" : "⚠️"}
              </span>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-widest">
                  {alarmLevel === "LEAK"
                    ? `LEAK DETECTED · km ${leakKm.toFixed(1)} · ${leakSeverity}`
                    : alarmLevel === "CRITICAL"
                    ? `CRITICAL PRESSURE · ${criticalPts.length} sensor${criticalPts.length > 1 ? "s" : ""}`
                    : `PRESSURE WARNING · ${warningPts.length} sensor${warningPts.length > 1 ? "s" : ""}`}
                </div>
                <div className="text-[9px] text-white/80">
                  WhatsApp notification sent automatically
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAlarmMuted((v) => !v)}
                className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] text-white hover:bg-white/20 transition-colors"
              >
                {alarmMuted ? "🔇 Unmute" : "🔔 Mute"}
              </button>
              <button
                onClick={() => setAlarmDismissed(true)}
                className="rounded border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] text-white hover:bg-white/20 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Affected sensors list — bottom right */}
          {(criticalPts.length > 0 || warningPts.length > 0) && (
            <div className="pointer-events-none absolute bottom-16 right-3 rounded-md border border-red-500/30 bg-background/90 p-2 text-[10px] backdrop-blur">
              <div className="mb-1 font-semibold uppercase tracking-wider text-red-400">Affected Sensors</div>
              {criticalPts.map((p) => (
                <div key={p.code} className="flex items-center gap-2 text-red-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono">{p.code}</span>
                  <span className="text-red-400/70">
                    {p.currentPressure?.toFixed(1) ?? "?"} bar
                  </span>
                </div>
              ))}
              {warningPts.map((p) => (
                <div key={p.code} className="flex items-center gap-2 text-amber-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono">{p.code}</span>
                  <span className="text-amber-400/70">
                    {p.currentPressure?.toFixed(1) ?? "?"} bar
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── WhatsApp status toast ── */}
      {waStatus !== "idle" && (
        <div className={`absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur transition-all ${
          waStatus === "sending" ? "border-primary/40 bg-background/80 text-primary animate-pulse" :
          waStatus === "sent"    ? "border-green-500/40 bg-green-500/10 text-green-400" :
                                   "border-red-500/40 bg-red-500/10 text-red-400"
        }`}>
          {waStatus === "sending" ? "📱 Sending to WhatsApp…" :
           waStatus === "sent"    ? "✅ WhatsApp sent!" :
                                    "❌ WhatsApp failed"}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 rounded-md border border-border/40 bg-background/70 px-3 py-1.5 text-[10px] backdrop-blur">
        <div className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">Status</div>
        <LegendDot color={STATUS_COLORS.NORMAL} label="Normal" />
        <LegendDot color={STATUS_COLORS.WARNING} label="Warning" />
        <LegendDot color={STATUS_COLORS.CRITICAL} label="Critical" />
        {hasLeak && <LegendDot color="#ef4444" label="Leak" pulse />}
      </div>

      {/* Canvas */}
      <SceneErrorBoundary>
        <Canvas
          camera={{ position: [SCENE_LENGTH * 0.4, 9, SCENE_LENGTH * 0.55], fov: 45 }}
          dpr={[1, 2]}
          shadows
          gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor("#1a1410");
            // ACES tone-mapping for cinematic look
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.1;
          }}
        >
          {/* Sky-like fog — desert haze at horizon */}
          <fog attach="fog" args={["#3a2818", 35, 90]} />

          {/* Warm sunset key light (sun) — casts shadows */}
          <directionalLight
            position={[18, 22, 10]}
            intensity={2.2}
            color="#ffd9a8"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={80}
            shadow-camera-left={-40}
            shadow-camera-right={40}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
          />
          {/* Cool fill from opposite side — sky bounce */}
          <directionalLight position={[-12, 8, -6]} intensity={0.5} color="#5e88c4" />
          {/* Soft ambient — desert dusk */}
          <ambientLight intensity={0.35} color="#ffc488" />
          {/* Rim light from behind */}
          <pointLight position={[0, 6, -15]} intensity={0.3} color="#ff7d3d" />

          {/* Sky dome — gradient backdrop */}
          <SkyDome />

          {/* Desert ground */}
          <DesertGround />

          <PipelineCylinder length={SCENE_LENGTH} />

          {pipelineLength > 0 && Array.from({ length: Math.floor(pipelineLength / 5) + 1 }, (_, i) => {
            const km = i * 5;
            if (km > pipelineLength) return null;
            return <DistanceMarker key={`d-${i}`} x={kmToX(km)} />;
          })}

          {pressurePoints.map((p, i) => (
            <PressurePointMarker
              key={p.id}
              x={kmToX(p.positionKm)}
              status={p.status}
              focused={focusedIdx === i && selectedIdx !== i}
              selected={selectedIdx === i}
              onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
            />
          ))}

          {hasLeak && (
            <LeakIndicator
              x={kmToX(leakKm)}
              severity={leakSeverity}
            />
          )}

          {/* OrbitControls handles mouse/touch; disabled when gamepad is active to avoid fighting */}
          <OrbitControls
            enabled={!gamepad.connected}
            enablePan={false}
            autoRotate={autoRotate && !gamepad.connected}
            autoRotateSpeed={0.4}
            minDistance={10}
            maxDistance={60}
            maxPolarAngle={Math.PI / 2.1}
          />

          {/* PS5 controller camera driver */}
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

      {/* Controller connected indicator — minimal dot only */}
      {gamepad.connected && (
        <div className="absolute right-3 bottom-4 z-10 flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/70 px-2 py-1 text-[10px] text-primary backdrop-blur">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          🎮
        </div>
      )}
    </div>
  );
}

// Default export — Next.js dynamic() can pick either named or default
export default Pipeline3DScene;

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

/**
 * Realistic oil/gas pipeline:
 *   - Main body: dark coated steel (epoxy-painted black with slight blue undertone)
 *   - Welded joints every 4 units along the length (visible bands)
 *   - End caps (flanges) at both ends
 *   - Subtle hazard band wrap near middle
 */
function PipelineCylinder({ length }: { length: number }) {
  const jointCount = Math.floor(length / 4);
  const joints = Array.from({ length: jointCount + 1 }, (_, i) => -length / 2 + i * 4);

  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {/* Main pipe body — dark coated steel */}
      <Cylinder args={[PIPELINE_RADIUS, PIPELINE_RADIUS, length, 64]} castShadow receiveShadow>
        <meshStandardMaterial color="#1a1d24" metalness={0.85} roughness={0.45} />
      </Cylinder>

      {/* Specular highlight stripe — gives the polished metal feel */}
      <Cylinder args={[PIPELINE_RADIUS * 1.001, PIPELINE_RADIUS * 1.001, length, 64]}>
        <meshStandardMaterial
          color="#3a4250"
          metalness={1.0}
          roughness={0.2}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </Cylinder>

      {/* Welded joints — slightly raised metallic rings */}
      {joints.map((y, i) => (
        <Cylinder key={`j-${i}`} args={[PIPELINE_RADIUS * 1.04, PIPELINE_RADIUS * 1.04, 0.08, 32]} position={[0, y, 0]} castShadow>
          <meshStandardMaterial color="#5a6470" metalness={0.95} roughness={0.3} />
        </Cylinder>
      ))}

      {/* Yellow hazard band at center — safety marking */}
      <Cylinder args={[PIPELINE_RADIUS * 1.015, PIPELINE_RADIUS * 1.015, 0.4, 64]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#f5b41a" metalness={0.4} roughness={0.55} />
      </Cylinder>

      {/* Flange end caps */}
      <Cylinder args={[PIPELINE_RADIUS * 1.25, PIPELINE_RADIUS * 1.25, 0.3, 32]} position={[0, length / 2, 0]} castShadow>
        <meshStandardMaterial color="#2a2f38" metalness={0.95} roughness={0.35} />
      </Cylinder>
      <Cylinder args={[PIPELINE_RADIUS * 1.25, PIPELINE_RADIUS * 1.25, 0.3, 32]} position={[0, -length / 2, 0]} castShadow>
        <meshStandardMaterial color="#2a2f38" metalness={0.95} roughness={0.35} />
      </Cylinder>
    </group>
  );
}

/** Sky dome — radial gradient from dusk-orange near horizon to deep blue overhead. */
function SkyDome() {
  return (
    <mesh scale={[-1, 1, 1]} position={[0, 0, 0]}>
      <sphereGeometry args={[80, 32, 32]} />
      <meshBasicMaterial side={THREE.BackSide}>
        <canvasTexture
          attach="map"
          image={makeGradientCanvas()}
        />
      </meshBasicMaterial>
    </mesh>
  );
}

function makeGradientCanvas(): HTMLCanvasElement {
  // Build once per mount — small (64×256) gradient sky
  if (typeof document === "undefined") {
    // SSR fallback — this should never run because parent uses ssr:false
    return {} as HTMLCanvasElement;
  }
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#0a0e1f"); // zenith — deep night blue
  grad.addColorStop(0.4, "#1a1f3a");
  grad.addColorStop(0.65, "#6b3a2a"); // sun band — burnt orange
  grad.addColorStop(0.85, "#3a2818");
  grad.addColorStop(1.0, "#1a1410"); // ground horizon
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  return c;
}

/** Desert ground — sandy plane with subtle bumps */
function DesertGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
      <planeGeometry args={[200, 200, 1, 1]} />
      <meshStandardMaterial
        color="#a89070"
        roughness={0.95}
        metalness={0.0}
      />
    </mesh>
  );
}

/**
 * Realistic pressure sensor instrumentation:
 *   - Saddle clamp mounted on the pipe
 *   - Vertical riser (stainless steel pipe section)
 *   - Pressure transmitter housing (cylindrical)
 *   - Glass dome LED at top — color = status
 */
function PressurePointMarker({
  x, status, focused, selected, onClick,
}: {
  x: number;
  status: string;
  focused:  boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const ledRef   = useRef<THREE.Mesh>(null);
  const ringRef  = useRef<THREE.Mesh>(null);
  const color    = STATUS_COLORS[status] ?? STATUS_COLORS.NORMAL;
  const emissive = status === "CRITICAL" ? 2.5 : status === "WARNING" ? 1.6 : 0.7;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Status pulse on LED
    if (ledRef.current) {
      if (status === "CRITICAL" || status === "WARNING") {
        const speed = status === "CRITICAL" ? 5 : 3;
        ledRef.current.scale.setScalar(1 + Math.sin(t * speed) * 0.18);
      } else {
        ledRef.current.scale.setScalar(1);
      }
    }
    // Focus ring spins slowly
    if (ringRef.current && focused) {
      ringRef.current.rotation.z = t * 1.5;
      const pulse = 0.85 + Math.sin(t * 4) * 0.15;
      ringRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={[x, 0, 0]}>
      {/* Saddle clamp */}
      <mesh position={[0, PIPELINE_RADIUS + 0.05, 0]} castShadow>
        <boxGeometry args={[0.5, 0.1, 0.8]} />
        <meshStandardMaterial color="#2a2f38" metalness={0.85} roughness={0.45} />
      </mesh>

      {/* Vertical stainless riser */}
      <mesh position={[0, PIPELINE_RADIUS + 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 1.0, 16]} />
        <meshStandardMaterial color="#9aa0aa" metalness={0.95} roughness={0.25} />
      </mesh>

      {/* Transmitter housing */}
      <mesh position={[0, PIPELINE_RADIUS + 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.35, 16]} />
        <meshStandardMaterial color="#d8d6cf" metalness={0.4} roughness={0.55} />
      </mesh>

      {/* Display face */}
      <mesh position={[0, PIPELINE_RADIUS + 1.25, 0.19]}>
        <planeGeometry args={[0.22, 0.14]} />
        <meshStandardMaterial color="#0d141f" emissive="#0d141f" emissiveIntensity={0.5} />
      </mesh>

      {/* Glass dome */}
      <Sphere args={[0.18, 24, 24]} position={[0, PIPELINE_RADIUS + 1.55, 0]}>
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.05} transparent opacity={0.35} />
      </Sphere>

      {/* LED orb */}
      <Sphere
        ref={ledRef}
        args={[selected ? 0.13 : 0.1, 24, 24]}
        position={[0, PIPELINE_RADIUS + 1.55, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} />
      </Sphere>

      {/* FOCUSED — spinning white selection ring (D-pad cursor) */}
      {focused && (
        <mesh ref={ringRef} position={[0, PIPELINE_RADIUS + 1.55, 0]}>
          <torusGeometry args={[0.38, 0.04, 8, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
        </mesh>
      )}

      {/* SELECTED — soft glow halo (HUD is open) */}
      {selected && (
        <Sphere args={[0.55, 24, 24]} position={[0, PIPELINE_RADIUS + 1.55, 0]}>
          <meshBasicMaterial color={color} transparent opacity={0.18} />
        </Sphere>
      )}
    </group>
  );
}

/**
 * Distance marker — yellow/black hazard pole + base, like real pipeline km markers.
 */
function DistanceMarker({ x }: { x: number }) {
  return (
    <group position={[x, -1.5, 0]}>
      {/* Concrete base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.4, 0.2, 0.4]} />
        <meshStandardMaterial color="#8a8378" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Striped post — yellow */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 12]} />
        <meshStandardMaterial color="#f5b41a" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Black band */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.15, 12]} />
        <meshStandardMaterial color="#111111" roughness={0.6} />
      </mesh>
      {/* Top reflector */}
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#ff5e3a" emissive="#ff5e3a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Realistic leak indicator:
 *   - Hot gas/oil escape at the pipe surface (orange-yellow glow)
 *   - Three rising plume puffs (gray smoke) at offset positions
 *   - Pulsing siren beacon overhead (red)
 *   - Search-light cone pointing down to mark the spot
 */
function LeakIndicator({
  x, severity,
}: { x: number; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }) {
  const beaconRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const plume1 = useRef<THREE.Mesh>(null);
  const plume2 = useRef<THREE.Mesh>(null);
  const plume3 = useRef<THREE.Mesh>(null);
  const intensity = severity === "CRITICAL" ? 3.5 : severity === "HIGH" ? 2.5 : severity === "MEDIUM" ? 1.6 : 0.9;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Pulsing beacon
    if (beaconRef.current) {
      const pulse = 1 + Math.sin(t * 5) * 0.25;
      beaconRef.current.scale.setScalar(pulse);
      const mat = beaconRef.current.material as THREE.MeshStandardMaterial;
      if (mat) mat.emissiveIntensity = 2 + Math.sin(t * 5) * 1.5;
    }
    // Expanding ring
    if (ringRef.current) {
      const r = ((t * 1.5) % 2);
      ringRef.current.scale.setScalar(1 + r);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.5 * (1 - r / 2);
    }
    // Rising gas plumes — animate Y up + fade
    [plume1, plume2, plume3].forEach((p, i) => {
      if (!p.current) return;
      const phase = (t + i * 0.7) % 2.5;
      p.current.position.y = PIPELINE_RADIUS + 0.3 + phase * 1.6;
      const mat = p.current.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.5 * (1 - phase / 2.5);
      p.current.scale.setScalar(0.3 + phase * 0.35);
    });
  });

  return (
    <group position={[x, 0, 0]}>
      {/* Hot escape point — at pipe surface */}
      <Sphere args={[0.22, 24, 24]} position={[0, PIPELINE_RADIUS - 0.05, 0]}>
        <meshStandardMaterial
          color="#ffd96b"
          emissive="#ff7a1a"
          emissiveIntensity={intensity}
        />
      </Sphere>

      {/* Outer halo — heat shimmer */}
      <Sphere args={[0.45, 24, 24]} position={[0, PIPELINE_RADIUS - 0.05, 0]}>
        <meshBasicMaterial color="#ff7a1a" transparent opacity={0.25} />
      </Sphere>

      {/* Rising gas plumes (3 staggered) */}
      <Sphere ref={plume1} args={[0.35, 16, 16]} position={[0, PIPELINE_RADIUS + 0.3, 0]}>
        <meshBasicMaterial color="#cccccc" transparent opacity={0.5} />
      </Sphere>
      <Sphere ref={plume2} args={[0.4, 16, 16]} position={[0.15, PIPELINE_RADIUS + 0.3, 0.1]}>
        <meshBasicMaterial color="#a8a8a8" transparent opacity={0.4} />
      </Sphere>
      <Sphere ref={plume3} args={[0.3, 16, 16]} position={[-0.1, PIPELINE_RADIUS + 0.3, -0.15]}>
        <meshBasicMaterial color="#b8b8b8" transparent opacity={0.45} />
      </Sphere>

      {/* Beacon pole — striped */}
      <mesh position={[0, 2.0, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 2.4, 12]} />
        <meshStandardMaterial color="#1a1d24" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.2, 12]} />
        <meshStandardMaterial color="#f5b41a" />
      </mesh>

      {/* Siren beacon — pulsing red sphere */}
      <Sphere ref={beaconRef} args={[0.28, 24, 24]} position={[0, 3.3, 0]}>
        <meshStandardMaterial color="#ff2a1a" emissive="#ff2a1a" emissiveIntensity={2.5} />
      </Sphere>

      {/* Beacon halo (always visible) */}
      <Sphere args={[0.45, 16, 16]} position={[0, 3.3, 0]}>
        <meshBasicMaterial color="#ff2a1a" transparent opacity={0.35} />
      </Sphere>

      {/* Expanding warning ring on ground */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.45, 0]}>
        <ringGeometry args={[0.8, 1.2, 32]} />
        <meshBasicMaterial color="#ff2a1a" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Static ground warning circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.48, 0]}>
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshBasicMaterial color="#ff2a1a" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────
// PS5 / Xbox controller — drives camera inside the Canvas
// ─────────────────────────────────────────────────────────
function GamepadCameraController({
  leftStickX, leftStickY, rightStickX, rightStickY, l2, r2, connected, resetTick, disableAutoRotateOnInput,
}: {
  leftStickX: number;
  leftStickY: number;
  rightStickX: number;
  rightStickY: number;
  l2: number;
  r2: number;
  connected: boolean;
  resetTick: number;
  disableAutoRotateOnInput: () => void;
}) {
  const { camera } = useThree();
  // Spherical coords for orbit around origin
  const sphericalRef = useRef(new THREE.Spherical());
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  // Capture the initial camera state once, so reset always returns to it
  const initialPositionRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    // Sync once on mount with current camera position
    sphericalRef.current.setFromVector3(camera.position);
    if (!initialPositionRef.current) {
      initialPositionRef.current = camera.position.clone();
    }
  }, [camera]);

  // Reset view when resetTick changes (triggered by △ Triangle button)
  useEffect(() => {
    if (resetTick === 0) return; // skip initial mount
    if (initialPositionRef.current) {
      camera.position.copy(initialPositionRef.current);
      sphericalRef.current.setFromVector3(initialPositionRef.current);
    }
    targetRef.current.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
  }, [resetTick, camera]);

  useFrame((_state, delta) => {
    if (!connected) return;
    const sph = sphericalRef.current;
    const dt = Math.min(delta, 0.05); // cap delta to avoid big jumps on tab-switch

    // Left stick — orbit around pipeline (yaw + pitch)
    const orbitSpeed = 2.2;
    const lx = Math.abs(leftStickX) > 0.08 ? leftStickX : 0; // dead-zone
    const ly = Math.abs(leftStickY) > 0.08 ? leftStickY : 0;
    if (lx !== 0 || ly !== 0) {
      sph.theta -= lx * orbitSpeed * dt;
      sph.phi   -= ly * orbitSpeed * dt;
      sph.phi    = Math.max(0.25, Math.min(Math.PI / 2.05, sph.phi));
      disableAutoRotateOnInput();
    }

    // Right stick — pan along the pipeline (slide left/right + forward/back)
    const panSpeed = 10;
    const rx = Math.abs(rightStickX) > 0.08 ? rightStickX : 0;
    const ry = Math.abs(rightStickY) > 0.08 ? rightStickY : 0;
    if (rx !== 0 || ry !== 0) {
      const t = targetRef.current;
      t.x += rx * panSpeed * dt;
      t.z += ry * panSpeed * dt;
      // Keep target near the pipeline
      t.x = Math.max(-SCENE_LENGTH * 0.7, Math.min(SCENE_LENGTH * 0.7, t.x));
      t.z = Math.max(-10, Math.min(10, t.z));
      disableAutoRotateOnInput();
    }

    // L2 / R2 — smooth zoom
    const zoomSpeed = 22;
    const zoomIn  = l2 > 0.05 ? l2 : 0;
    const zoomOut = r2 > 0.05 ? r2 : 0;
    if (zoomIn > 0 || zoomOut > 0) {
      sph.radius -= zoomIn  * zoomSpeed * dt;
      sph.radius += zoomOut * zoomSpeed * dt;
      sph.radius  = Math.max(6, Math.min(55, sph.radius));
      disableAutoRotateOnInput();
    }

    // Apply — always look at current target (pipeline stays in frame)
    const pos = new THREE.Vector3().setFromSpherical(sph).add(targetRef.current);
    camera.position.copy(pos);
    camera.lookAt(targetRef.current);
  });

  return null;
}

// ─────────────────────────────────────────────────────────
// SensorHUD — professional SCADA-style card
// ─────────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  LOW:      "#10b981",
  MEDIUM:   "#f59e0b",
  HIGH:     "#f97316",
  CRITICAL: "#ef4444",
  NO_DATA:  "#6b7280",
};

function PressureGauge({ current, min, max }: { current: number | null; min: number; max: number }) {
  const pct   = current !== null && max > min
    ? Math.min(1, Math.max(0, (current - min) / (max - min)))
    : 0;

  // SVG semicircle arc
  const R     = 42;
  const cx    = 60;
  const cy    = 58;
  const startAngle = 210; // degrees
  const sweepMax   = 120; // total arc degrees

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt    = (angle: number) => ({
    x: cx + R * Math.cos(toRad(angle)),
    y: cy + R * Math.sin(toRad(angle)),
  });

  const arcPath = (from: number, sweep: number) => {
    const s  = pt(from);
    const e  = pt(from + sweep);
    const la = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${la} 1 ${e.x} ${e.y}`;
  };

  const color = current === null
    ? "#6b7280"
    : current < min   ? "#ef4444"
    : current > max   ? "#ef4444"
    : pct > 0.85      ? "#f97316"
    : pct > 0.6       ? "#f59e0b"
    : "#10b981";

  return (
    <svg viewBox="0 0 120 75" className="w-full" style={{ maxHeight: 75 }}>
      {/* Track */}
      <path d={arcPath(startAngle, sweepMax)} fill="none" stroke="#2a3040" strokeWidth="7" strokeLinecap="round" />
      {/* Fill */}
      {current !== null && (
        <path d={arcPath(startAngle, sweepMax * pct)} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" />
      )}
      {/* Value */}
      <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize="14" fontFamily="monospace" fontWeight="bold">
        {current !== null ? current.toFixed(1) : "—"}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" fill="#9ca3af" fontSize="7">
        bar
      </text>
      {/* Min / Max labels */}
      <text x={pt(startAngle).x - 4} y={pt(startAngle).y + 8} fill="#6b7280" fontSize="6" textAnchor="middle">{min}</text>
      <text x={pt(startAngle + sweepMax).x + 4} y={pt(startAngle + sweepMax).y + 8} fill="#6b7280" fontSize="6" textAnchor="middle">{max}</text>
    </svg>
  );
}

function SensorHUD({
  point, index, total, gamepadConnected, onClose,
}: {
  point: PressurePoint;
  index: number;
  total: number;
  gamepadConnected: boolean;
  onClose: () => void;
}) {
  const statusColor = STATUS_COLORS[point.status] ?? STATUS_COLORS.NORMAL;

  return (
    <div className="absolute right-3 top-20 z-10 w-72 rounded-xl border border-primary/25 bg-background/90 shadow-2xl backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-primary/10 px-3 py-2 border-b border-primary/20">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: statusColor }} />
          <span className="font-mono text-sm font-bold tracking-wide">{point.code}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-muted-foreground tabular-nums">{index + 1}/{total}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs leading-none">✕</button>
        </div>
      </div>

      {/* Gauge */}
      <div className="px-4 pt-3 pb-1">
        <PressureGauge
          current={point.currentPressure}
          min={point.expectedMin}
          max={point.expectedMax}
        />
      </div>

      {/* Data rows */}
      <div className="px-3 pb-2 space-y-1 text-xs">
        <DataRow label="Position"  value={`km ${point.positionKm.toFixed(1)}`} />
        <DataRow label="Safe range" value={`${point.expectedMin} – ${point.expectedMax} bar`} />
        <DataRow
          label="Flow rate"
          value={point.currentFlow !== null ? `${point.currentFlow.toFixed(0)} m³/h` : "N/A"}
        />
        <DataRow
          label="Temperature"
          value={point.currentTemp !== null ? `${point.currentTemp.toFixed(1)} °C` : "N/A"}
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="font-bold uppercase tracking-wide" style={{ color: statusColor }}>
            {point.status}
          </span>
        </div>
      </div>

      {/* GPS */}
      <div className="mx-3 mb-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-[10px] font-mono text-muted-foreground">
        📍 {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
      </div>

      {/* Controller hints */}
      {gamepadConnected && (
        <div className="border-t border-border/30 px-3 py-1.5 grid grid-cols-4 gap-1 text-[9px] text-muted-foreground">
          {[
            ["◄►", "Navigate"],
            ["✕", "Close"],
            ["TP", "AI"],
            ["R1", "WhatsApp"],
          ].map(([btn, label]) => (
            <span key={btn} className="flex flex-col items-center gap-0.5">
              <kbd className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[9px]">{btn}</kbd>
              <span className="text-[8px]">{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// AIAnalysisPopup — touchpad triggered
// ─────────────────────────────────────────────────────────
function AIAnalysisPopup({
  loading, analysis, error, pointCode, gamepadConnected, onClose,
}: {
  loading:          boolean;
  analysis:         PointAnalysis | null;
  error:            string | null;
  pointCode:        string;
  gamepadConnected: boolean;
  onClose:          () => void;
}) {
  const riskColor = analysis ? (RISK_COLORS[analysis.risk] ?? "#6b7280") : "#6b7280";

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 mx-auto max-w-sm px-3 pb-3 pointer-events-none">
      <div className="rounded-xl border border-primary/30 bg-background/95 shadow-2xl backdrop-blur pointer-events-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-primary/20 bg-primary/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs">🤖</span>
            <span className="text-xs font-semibold">AEGIS AI · {pointCode}</span>
          </div>
          <button onClick={onClose} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-2 py-8 px-4">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">Analyzing sensor data…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-4 py-4 text-xs text-red-400">
            ⚠ {error}
          </div>
        )}

        {/* Result */}
        {analysis && !loading && (
          <div className="px-3 py-2 space-y-2">
            {/* Risk badge + confidence */}
            <div className="flex items-center justify-between">
              <span
                className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: riskColor, borderColor: riskColor + "60" }}
              >
                {analysis.risk} RISK
              </span>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-20 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${analysis.confidence * 100}%`, backgroundColor: riskColor }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground">
                  {(analysis.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Trend */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>{analysis.trend === "RISING" ? "↑" : analysis.trend === "FALLING" ? "↓" : analysis.trend === "UNSTABLE" ? "⚡" : "→"}</span>
              <span className="uppercase">{analysis.trend}</span>
              {analysis.maintenanceFlag && (
                <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-amber-400 text-[9px]">
                  🔧 MAINTENANCE
                </span>
              )}
            </div>

            {/* Summary EN */}
            <p className="text-[11px] leading-relaxed">{analysis.summary}</p>

            {/* Summary AR */}
            <p className="text-[11px] leading-relaxed text-right text-muted-foreground" dir="rtl">
              {analysis.summaryAr}
            </p>

            {/* Recommendations */}
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">Actions</div>
              <ul className="space-y-0.5">
                {analysis.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className="mt-px shrink-0 text-primary">›</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Dismiss hint */}
        {gamepadConnected && !loading && (
          <div className="border-t border-border/30 px-3 py-1 text-[9px] text-muted-foreground text-center">
            <kbd className="rounded bg-muted/40 px-1 font-mono">□</kbd> or <kbd className="rounded bg-muted/40 px-1 font-mono">TP</kbd> to close
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────
function LegendDot({ color, label, pulse }: { color: string; label: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 leading-none">
      <span
        className={`inline-block h-2 w-2 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}
