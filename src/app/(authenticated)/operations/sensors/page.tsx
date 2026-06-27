"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Flame, Wind, Thermometer, Radio,
  AlertTriangle, BellOff, Bell, X, Clock,
  Zap, Activity, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

interface Reading {
  deviceCode:  string;
  temperature: number | null;
  gasLevel:    number | null;
  alertActive: boolean;
  recordedAt:  string;
  voltage:     number | null;
  currentMa:   number | null;
  powerMw:     number | null;
  pressure:    number | null;
  uptimeS:     number | null;
}

interface SensorNode {
  code:        string;
  online:      boolean;
  latest:      Reading | null;
  gasHistory:  number[];
  tempHistory: number[];
  voltHistory: number[];
}

interface DangerEntry {
  deviceCode: string; deviceName: string;
  type: "flame" | "gas" | "temp";
  value: number; unit: string; firstSeen: number;
}

interface ConfirmedAlarm {
  key: string; deviceCode: string; deviceName: string;
  type: "flame" | "gas" | "temp";
  value: number; unit: string; triggeredAt: number; dismissed: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

const GAS_WARN  = 50;   const GAS_CRIT  = 100;
const TEMP_WARN = 45;   const TEMP_CRIT = 55;

const FLAME_PERSIST_MS  = 5_000;   // flame → alert after 5 s
const DANGER_PERSIST_MS = 10_000;  // gas / temp → alert after 10 s
const POLL_MS           = 3_000;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const HISTORY_MAX       = 40;

type Level = "normal" | "warning" | "critical";
const gasLvl  = (v: number): Level => v >= GAS_CRIT  ? "critical" : v >= GAS_WARN  ? "warning" : "normal";
const tempLvl = (v: number): Level => v >= TEMP_CRIT ? "critical" : v >= TEMP_WARN ? "warning" : "normal";

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "--";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtUptime(s: number | null) {
  if (!s) return "--";
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function playAlarm(ctx: AudioContext, level: "critical" | "warning") {
  const t0 = ctx.currentTime;
  const beep = (t: number, freq: number, dur: number, vol: number) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "square"; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  };
  if (level === "critical") {
    beep(t0, 880, 0.12, 0.22); beep(t0 + 0.2, 880, 0.12, 0.22); beep(t0 + 0.4, 880, 0.12, 0.22);
  } else {
    beep(t0, 660, 0.3, 0.15);
  }
}

// ─── Sparkline ───────────────────────────────────────────────────

function Sparkline({ values, max, color, height = 48 }: {
  values: number[]; max: number; color: string; height?: number;
}) {
  if (values.length < 2) return <div style={{ height }} className="w-full" />;
  const W = 300; const H = height;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - Math.min(1, v / max) * (H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fill = `0,${H} ${pts} ${W},${H}`;
  const lx = W;
  const ly = H - Math.min(1, values[values.length - 1] / max) * (H - 6) - 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height }}
      preserveAspectRatio="none">
      <polyline points={fill} fill={color} fillOpacity="0.1" stroke="none" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill={color} opacity="0.9" />
    </svg>
  );
}

// ─── LED Dot ─────────────────────────────────────────────────────

function LED({ on, color }: { on: boolean; color: string }) {
  return (
    <span className="inline-block h-2 w-2 rounded-full" style={{
      background: on ? color : "#374151",
      boxShadow: on ? `0 0 6px ${color}` : "none",
    }} />
  );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function SensorsPage() {
  const [nodes,           setNodes]           = useState<Record<string, SensorNode>>({});
  const [loading,         setLoading]         = useState(true);
  const [lastPoll,        setLastPoll]        = useState<Date | null>(null);
  const [confirmedAlarms, setConfirmedAlarms] = useState<ConfirmedAlarm[]>([]);
  const [soundOn,         setSoundOn]         = useState(true);
  const [countdown,       setCountdown]       = useState<Record<string, number>>({});

  const dangerRef    = useRef<Record<string, DangerEntry>>({});
  const sentRef      = useRef<Record<string, number>>({});
  const soundRef     = useRef(true);
  const audioRef     = useRef<AudioContext | null>(null);
  const loopRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedRef = useRef<ConfirmedAlarm[]>([]);

  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);
  useEffect(() => { confirmedRef.current = confirmedAlarms; }, [confirmedAlarms]);

  const getCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioRef.current || audioRef.current.state === "closed")
        audioRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      return audioRef.current;
    } catch { return null; }
  }, []);

  const stopLoop = useCallback(() => {
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
  }, []);

  const startLoop = useCallback((lvl: "critical" | "warning") => {
    if (loopRef.current) return;
    const ctx = getCtx(); if (!ctx) return;
    const fire = () => { if (soundRef.current) playAlarm(ctx, lvl); };
    fire();
    loopRef.current = setInterval(fire, lvl === "critical" ? 3000 : 4500);
  }, [getCtx]);

  useEffect(() => {
    const active = confirmedAlarms.some((a) => !a.dismissed);
    if (!active) { stopLoop(); return; }
    const crit = confirmedAlarms.some((a) => !a.dismissed && (a.type === "flame" || a.type === "gas"));
    startLoop(crit ? "critical" : "warning");
  }, [confirmedAlarms, startLoop, stopLoop]);

  const fireAlert = useCallback((entry: DangerEntry) => {
    const now = Date.now();
    const k   = entry.deviceCode + ":" + entry.type;
    if (now - (sentRef.current[k] ?? 0) < ALERT_COOLDOWN_MS) return;
    sentRef.current[k] = now;
    fetch("/api/sensors/alert-trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aegis-client": "1" },
      body: JSON.stringify({
        sensorCode: entry.deviceCode, sensorName: entry.deviceCode,
        value: entry.value, unit: entry.unit, alertLevel: "CRITICAL",
        type:  entry.type === "flame" ? "FLAME_DETECTOR"
             : entry.type === "gas"   ? "GAS_SENSOR" : "TEMPERATURE",
        label: entry.type === "flame" ? "Flame Detected"
             : entry.type === "gas"   ? `Critical Gas: ${entry.value.toFixed(1)} ${entry.unit}`
             : `Critical Temp: ${entry.value.toFixed(1)} ${entry.unit}`,
      }),
    }).catch(() => {});
  }, []);

  const processDanger = useCallback((
    checks: Array<{
      key: string; dangerous: boolean;
      entry: Omit<DangerEntry, "firstSeen">;
      persistMs: number;
    }>,
    now: number,
    danger: Record<string, DangerEntry>,
    counts: Record<string, number>,
  ) => {
    for (const { key, dangerous, entry, persistMs } of checks) {
      if (dangerous) {
        danger[key] = danger[key] ? { ...danger[key], ...entry } : { ...entry, firstSeen: now };
        const elapsed = now - danger[key].firstSeen;
        counts[key] = Math.ceil(Math.max(0, persistMs - elapsed) / 1000);
        if (elapsed >= persistMs) {
          const already = confirmedRef.current.some((a) => a.key === key && !a.dismissed);
          if (!already) {
            setConfirmedAlarms((prev) => [...prev.filter((a) => a.key !== key),
              { key, ...entry, triggeredAt: now, dismissed: false }]);
            fireAlert(danger[key]);
          }
        }
      } else {
        delete danger[key];
        setConfirmedAlarms((prev) =>
          prev.map((a) => a.key === key ? { ...a, dismissed: true } : a)
              .filter((a) => !a.dismissed || a.triggeredAt > now - 5 * 60_000));
      }
    }
  }, [fireAlert]);

  const poll = useCallback(async () => {
    const now    = Date.now();
    const danger = { ...dangerRef.current };
    const counts: Record<string, number> = {};

    try {
      const res  = await fetch("/api/data", { cache: "no-store" });
      const json = await res.json();
      console.log("[Sensors] /api/data response:", JSON.stringify(json?.data?.latest ?? "no latest"));
      if (json.ok) {
        const lt   = json.data?.latest ?? null;
        const code = lt?.deviceCode || "001";
        const stale = lt?.recordedAt
          ? (now - new Date(lt.recordedAt).getTime()) > 60_000
          : true;
        const reading: Reading | null = lt ? {
          deviceCode:  code,
          temperature: lt.temperature  ?? null,
          gasLevel:    lt.gasVal       ?? null,
          alertActive: lt.eventType === "CRASH",
          recordedAt:  lt.recordedAt   ?? new Date().toISOString(),
          voltage:     lt.voltage      ?? null,
          currentMa:   lt.currentMa    ?? null,
          powerMw:     lt.powerMw      ?? null,
          pressure:    lt.pressure     ?? null,
          uptimeS:     lt.uptimeS      ?? null,
        } : null;
        setNodes((prev) => {
          const ex = prev[code] ?? { code, online: false, latest: null, gasHistory: [], tempHistory: [], voltHistory: [] };
          return {
            ...prev,
            [code]: {
              code,
              online: !stale && reading !== null,
              latest: reading,
              gasHistory:  reading ? [...ex.gasHistory,  reading.gasLevel    ?? 0].slice(-HISTORY_MAX) : ex.gasHistory,
              tempHistory: reading ? [...ex.tempHistory, reading.temperature ?? 0].slice(-HISTORY_MAX) : ex.tempHistory,
              voltHistory: reading ? [...ex.voltHistory, reading.voltage     ?? 0].slice(-HISTORY_MAX) : ex.voltHistory,
            },
          };
        });
        if (reading && !stale) {
          processDanger([
            {
              key: `${code}:flame`, dangerous: reading.alertActive, persistMs: FLAME_PERSIST_MS,
              entry: { deviceCode: code, deviceName: code, type: "flame", value: 1, unit: "FLAME" },
            },
            {
              key: `${code}:gas`, persistMs: DANGER_PERSIST_MS,
              dangerous: reading.gasLevel !== null && gasLvl(reading.gasLevel) !== "normal",
              entry: { deviceCode: code, deviceName: code, type: "gas", value: reading.gasLevel ?? 0, unit: "ppm" },
            },
            {
              key: `${code}:temp`, persistMs: DANGER_PERSIST_MS,
              dangerous: reading.temperature !== null && tempLvl(reading.temperature) !== "normal",
              entry: { deviceCode: code, deviceName: code, type: "temp", value: reading.temperature ?? 0, unit: "C" },
            },
          ], now, danger, counts);
        }
      }
    } catch { /* offline */ }

    setLastPoll(new Date());
    setLoading(false);
    dangerRef.current = danger;
    setCountdown(counts);
  }, [processDanger]);

  useEffect(() => {
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  const dismiss    = useCallback((key: string) =>
    setConfirmedAlarms((p) => p.map((a) => a.key === key ? { ...a, dismissed: true } : a)), []);
  const dismissAll = useCallback(() => {
    setConfirmedAlarms((p) => p.map((a) => ({ ...a, dismissed: true }))); stopLoop();
  }, [stopLoop]);

  const activeAlarms = confirmedAlarms.filter((a) => !a.dismissed);
  const nodeList     = Object.values(nodes);
  const onlineCount  = nodeList.filter((n) => n.online).length;

  return (
    <div className="min-h-screen bg-background">

      {/* ══ TOP BAR ═══════════════════════════════════════════ */}
      <div className="sticky top-0 z-30 border-b border-border/30 bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse inline-block" />
              <span className="font-mono text-xs font-bold text-green-400 tracking-widest">LIVE</span>
            </div>
            <div className="h-4 w-px bg-border/40" />
            <span className="font-mono text-sm font-bold text-foreground tracking-wide">AEGIS / SENSORS</span>
            <div className="h-4 w-px bg-border/40" />
            <span className="font-mono text-xs text-muted-foreground">
              {nodeList.length} node{nodeList.length !== 1 ? "s" : ""} &nbsp;·&nbsp; {onlineCount} online
              {lastPoll && <span className="ml-2 opacity-50">· {timeAgo(lastPoll.toISOString())}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {activeAlarms.length > 0 && (
              <span className="flex items-center gap-1.5 rounded border border-red-500/50 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-400 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                {activeAlarms.length} ALARM{activeAlarms.length > 1 ? "S" : ""}
              </span>
            )}
            <button onClick={() => setSoundOn((v) => !v)}
              className={cn("flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11px] font-medium transition-all",
                soundOn ? "border-primary/30 bg-primary/10 text-primary" : "border-border/30 text-muted-foreground")}>
              {soundOn ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              {soundOn ? "SOUND ON" : "MUTED"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ══ ALARM BANNER ════════════════════════════════════ */}
        {activeAlarms.length > 0 && (
          <div className="rounded-xl border-2 border-red-500/60 overflow-hidden">
            <div className="flex items-center justify-between bg-red-600/60 px-5 py-2.5">
              <div className="flex items-center gap-2 font-bold text-white text-sm uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 animate-pulse" />
                DANGER CONFIRMED — {activeAlarms.length} ACTIVE
              </div>
              <div className="flex gap-2">
                <button onClick={() => setSoundOn((v) => !v)}
                  className="rounded border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/20">
                  {soundOn ? "MUTE" : "UNMUTE"}
                </button>
                <button onClick={dismissAll}
                  className="rounded border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/20">
                  DISMISS ALL
                </button>
              </div>
            </div>
            <div className="p-3 space-y-2 bg-red-950/20">
              {activeAlarms.map((a) => (
                <div key={a.key} className="flex items-center justify-between rounded-lg border border-red-500/25 bg-background/60 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{a.type === "flame" ? "🔥" : a.type === "gas" ? "💨" : "🌡️"}</span>
                    <div>
                      <div className="font-bold text-red-300 text-xs tracking-wide">
                        {a.type === "flame" ? "FLAME DETECTED — 5s SUSTAINED"
                          : a.type === "gas"   ? `GAS CRITICAL — ${a.value.toFixed(1)} ppm`
                          : `TEMP CRITICAL — ${a.value.toFixed(1)} C`}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {a.deviceCode} · {new Date(a.triggeredAt).toLocaleTimeString()} · WhatsApp sent
                      </div>
                    </div>
                  </div>
                  <button onClick={() => dismiss(a.key)} className="p-1.5 rounded text-red-400 hover:bg-red-500/10">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ COUNTDOWN ═══════════════════════════════════════ */}
        {Object.keys(countdown).length > 0 && activeAlarms.length === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
            <span className="text-xs text-amber-300 font-medium">Sustained reading — alarm in</span>
            {Object.entries(countdown).map(([k, s]) => {
              const label = k.includes(":flame") ? "🔥" : k.includes(":gas") ? "💨" : "🌡️";
              return (
                <span key={k} className="flex items-center gap-0.5 font-mono font-bold text-amber-400 text-sm">
                  {label} <Clock className="h-3 w-3 ml-1" />{s}s
                </span>
              );
            })}
          </div>
        )}

        {/* ══ SENSOR GRID ═════════════════════════════════════ */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-3 text-muted-foreground">
            <Radio className="h-6 w-6 animate-pulse" />
            <p className="text-sm font-mono tracking-widest">CONNECTING TO SENSOR NETWORK...</p>
          </div>
        ) : nodeList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 rounded-xl border border-dashed border-border/30 gap-3 text-muted-foreground">
            <Radio className="h-8 w-8 opacity-20" />
            <p className="font-mono text-sm tracking-widest">NO SENSOR DATA</p>
            <p className="text-xs opacity-50">Waiting for /api/data...</p>
          </div>
        ) : (
          <div className={cn("grid gap-5",
            nodeList.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 lg:grid-cols-2")}>
            {nodeList.map((node) => (
              <SensorCard key={node.code} node={node} countdown={countdown} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sensor Card ──────────────────────────────────────────────────

function SensorCard({ node, countdown }: { node: SensorNode; countdown: Record<string, number> }) {
  const r     = node.latest;
  const gas   = r?.gasLevel    ?? null;
  const temp  = r?.temperature ?? null;
  const flame = r?.alertActive ?? false;
  const gLvl  = gas  !== null ? gasLvl(gas)   : "normal";
  const tLvl  = temp !== null ? tempLvl(temp) : "normal";

  const isCritical = flame || gLvl === "critical" || tLvl === "critical";
  const isWarning  = !isCritical && (gLvl === "warning" || tLvl === "warning");

  const borderColor = isCritical ? "border-red-500/50" : isWarning ? "border-amber-400/40" : node.online ? "border-green-500/20" : "border-border/30";
  const glowClass   = isCritical ? "shadow-[0_0_40px_rgba(239,68,68,0.2)]" : isWarning ? "shadow-[0_0_30px_rgba(251,191,36,0.1)]" : "";

  const gasColor  = gLvl === "critical" ? "#ef4444" : gLvl === "warning" ? "#f59e0b" : "#22c55e";
  const tempColor = tLvl === "critical" ? "#ef4444" : tLvl === "warning" ? "#f59e0b" : "#22c55e";
  const voltColor = "#818cf8";

  return (
    <div className={cn("rounded-2xl border-2 bg-card overflow-hidden transition-all", borderColor, glowClass)}>

      {/* Card Header */}
      <div className={cn("flex items-center justify-between px-5 py-3 border-b border-border/20",
        isCritical ? "bg-red-500/8" : isWarning ? "bg-amber-400/5" : "bg-muted/5")}>
        <div className="flex items-center gap-3">
          <LED on={node.online} color={isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e"} />
          <span className="font-mono font-bold text-sm tracking-widest">{node.code}</span>
          {isCritical && (
            <span className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400 tracking-widest animate-pulse">
              DANGER
            </span>
          )}
          {isWarning && (
            <span className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 tracking-widest">
              WARNING
            </span>
          )}
          {node.online && !isCritical && !isWarning && (
            <span className="rounded border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[9px] font-medium text-green-400 tracking-widest">
              ONLINE
            </span>
          )}
          {!node.online && (
            <span className="rounded border border-border/30 bg-muted/10 px-2 py-0.5 text-[9px] text-muted-foreground tracking-widest">
              OFFLINE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          {r?.uptimeS !== null && r?.uptimeS !== undefined && r.uptimeS > 0 && (
            <span className="opacity-50">up {fmtUptime(r.uptimeS)}</span>
          )}
          <span>{timeAgo(r?.recordedAt)}</span>
        </div>
      </div>

      {r ? (
        <div className="p-5 space-y-4">

          {/* ─ Hero readings ─────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">

            {/* FLAME */}
            <div className={cn("rounded-xl border p-4 flex flex-col items-center gap-2 transition-all",
              flame ? "border-red-500/40 bg-red-500/8" : "border-border/20 bg-muted/5")}>
              <Flame className={cn("h-5 w-5", flame ? "text-red-400 animate-pulse" : "text-muted-foreground/25")} />
              <div className={cn("font-mono font-black leading-none tabular-nums",
                flame ? "text-red-400 text-2xl" : "text-muted-foreground/40 text-lg")}>
                {flame ? "!!!" : "OK"}
              </div>
              {flame && (
                <div className="text-[9px] font-bold text-red-400 tracking-widest">
                  {countdown[`${node.code}:flame`] !== undefined
                    ? <span className="flex items-center gap-0.5"><Clock className="h-2 w-2" />{countdown[`${node.code}:flame`]}s</span>
                    : "ALARM"}
                </div>
              )}
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-auto">Flame</div>
            </div>

            {/* GAS */}
            <div className={cn("rounded-xl border p-4 flex flex-col items-center gap-1 transition-all",
              gLvl === "critical" ? "border-red-500/40 bg-red-500/8"
                : gLvl === "warning" ? "border-amber-400/40 bg-amber-400/5"
                : "border-border/20 bg-muted/5")}>
              <Wind className="h-4 w-4 text-muted-foreground/30" />
              <div className="font-mono font-black tabular-nums leading-none" style={{ color: gasColor, fontSize: "2.2rem" }}>
                {gas !== null ? gas.toFixed(0) : "--"}
              </div>
              <div className="text-[10px] font-mono" style={{ color: gasColor }}>ppm</div>
              {countdown[`${node.code}:gas`] !== undefined && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono text-amber-400 animate-pulse">
                  <Clock className="h-2 w-2" />{countdown[`${node.code}:gas`]}s
                </span>
              )}
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-auto">Gas</div>
            </div>

            {/* TEMP */}
            <div className={cn("rounded-xl border p-4 flex flex-col items-center gap-1 transition-all",
              tLvl === "critical" ? "border-red-500/40 bg-red-500/8"
                : tLvl === "warning" ? "border-amber-400/40 bg-amber-400/5"
                : "border-border/20 bg-muted/5")}>
              <Thermometer className="h-4 w-4 text-muted-foreground/30" />
              <div className="font-mono font-black tabular-nums leading-none" style={{ color: tempColor, fontSize: "2.2rem" }}>
                {temp !== null ? temp.toFixed(1) : "--"}
              </div>
              <div className="text-[10px] font-mono" style={{ color: tempColor }}>°C</div>
              {countdown[`${node.code}:temp`] !== undefined && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono text-amber-400 animate-pulse">
                  <Clock className="h-2 w-2" />{countdown[`${node.code}:temp`]}s
                </span>
              )}
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-auto">Temp</div>
            </div>
          </div>

          {/* ─ Sparklines ────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <SparkBox label="Gas" unit="ppm" value={gas} history={node.gasHistory} max={200} color={gasColor} />
            <SparkBox label="Temp" unit="°C" value={temp} history={node.tempHistory} max={100} color={tempColor} />
            <SparkBox label="Voltage" unit="V" value={r.voltage} history={node.voltHistory} max={30} color={voltColor} />
          </div>

          {/* ─ Level bars ────────────────────────────────── */}
          <div className="space-y-1.5">
            <LevelBar label="Gas"  value={gas  ?? 0} max={200} warn={GAS_WARN}  crit={GAS_CRIT}  unit="ppm" />
            <LevelBar label="Temp" value={temp ?? 0} max={100} warn={TEMP_WARN} crit={TEMP_CRIT} unit="C"   />
          </div>

          {/* ─ Power / Electrical metrics ────────────────── */}
          <div className="rounded-xl border border-border/15 bg-muted/5 p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap className="h-3 w-3 text-indigo-400/70" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">Electrical</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <ElecMetric icon={<Zap   className="h-3 w-3" />} label="Voltage"  value={r.voltage}   unit="V"  color="#818cf8" />
              <ElecMetric icon={<Activity className="h-3 w-3" />} label="Current" value={r.currentMa !== null ? r.currentMa / 1000 : null} unit="A" color="#34d399" />
              <ElecMetric icon={<Gauge  className="h-3 w-3" />} label="Power"    value={r.powerMw    !== null ? r.powerMw  / 1000 : null} unit="W" color="#f59e0b" />
              <ElecMetric icon={<Gauge  className="h-3 w-3" />} label="Pressure" value={r.pressure}  unit="Pa" color="#60a5fa" />
            </div>
          </div>

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Radio className="h-6 w-6 opacity-20 animate-pulse" />
          <p className="text-xs font-mono tracking-widest opacity-50">AWAITING DATA...</p>
        </div>
      )}
    </div>
  );
}

// ─── SparkBox ─────────────────────────────────────────────────────

function SparkBox({ label, unit, value, history, max, color }: {
  label: string; unit: string; value: number | null;
  history: number[]; max: number; color: string;
}) {
  return (
    <div className="rounded-lg border border-border/15 bg-muted/5 px-3 pt-2 pb-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{label}</span>
        <span className="font-mono text-[11px] font-bold" style={{ color }}>
          {value !== null ? `${value.toFixed(1)} ${unit}` : "--"}
        </span>
      </div>
      <Sparkline values={history} max={max} color={color} height={36} />
    </div>
  );
}

// ─── ElecMetric ──────────────────────────────────────────────────

function ElecMetric({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: number | null; unit: string; color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ color }} className="opacity-60">{icon}</div>
      <div className="font-mono font-bold tabular-nums text-sm" style={{ color }}>
        {value !== null && value !== 0 ? value.toFixed(2) : "--"}
      </div>
      <div className="text-[9px] font-mono opacity-50" style={{ color }}>{unit}</div>
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground/30">{label}</div>
    </div>
  );
}

// ─── LevelBar ─────────────────────────────────────────────────────

function LevelBar({ label, value, max, warn, crit, unit }: {
  label: string; value: number; max: number; warn: number; crit: number; unit: string;
}) {
  const pct   = Math.min(100, (value / max) * 100);
  const level: Level = value >= crit ? "critical" : value >= warn ? "warning" : "normal";
  const color = level === "critical" ? "#ef4444" : level === "warning" ? "#f59e0b" : "#22c55e";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-muted-foreground/50 uppercase tracking-wider">{label}</span>
        <span style={{ color }}>{value.toFixed(1)} {unit}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/20 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
