"use client";

import { useEffect, useRef, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle, ShieldCheck, Activity, MapPin, Loader2,
  Radio, Thermometer, Wind, Zap, WifiOff, Wifi,
} from "lucide-react";
import { ForecastCard } from "@/components/dashboard/forecast-card";
import { cn } from "@/lib/utils";

interface DashboardData {
  activeSites?:       number;
  totalIncidents?:    number;
  openIncidents?:     number;
  activePermits?:     number;
  onlineSensors?:     number;
  totalSensors?:      number;
  criticalAlerts?:    number;
  pendingActions?:    number;
  complianceScore?:   number;
  overdueTraining?:   number;
  activeEmergencies?: number;
  recentAlerts?: Array<{
    id: string; type: string; title: string; message: string;
    createdAt: string; site?: { name: string } | null;
  }>;
}

interface SensorReading {
  deviceCode: string; eventType: string;
  gasVal: number; temperature: number; pressure: number;
  acceleration: number; voltage: number; currentMa: number;
  powerMw: number; recordedAt: string;
}

export default function DashboardPage() {
  const { data, loading } = useApi<DashboardData>("/api/dashboard", { refreshMs: 10000 });

  // Show full spinner only on initial load (no data yet)
  if (loading && !data) {
    return (
      <div className="container mx-auto px-6 py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d      = data ?? {};
  const alerts = d.recentAlerts ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">Command Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time HSSE operations overview</p>
      </div>

      {/* ── KPI Strip ──────────────────────────────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="Open Incidents"  value={d.openIncidents  ?? 0} tone="critical" />
        <KpiCard icon={Activity}      label="Active Alerts"   value={d.criticalAlerts ?? 0} tone="warning"  />
        <KpiCard icon={ShieldCheck}   label="Active Permits"  value={d.activePermits  ?? 0} tone="info"     />
        <KpiCard icon={MapPin}        label="Sites Online"    value={`${d.activeSites ?? 0}`} tone="success" />
      </div>

      {/* ── Site Sensor Widget ──────────────────────────── */}
      <div className="mb-6">
        <SensorWidget />
      </div>

      {/* ── Forecast ───────────────────────────────────── */}
      <div className="mb-6">
        <ForecastCard />
      </div>

      {/* ── Recent Alerts ──────────────────────────────── */}
      <Card className="glass">
        <CardContent className="p-4">
          <div className="mb-3 text-sm font-semibold">Recent Alerts ({alerts.length})</div>
          {alerts.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No active alerts</div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 10).map((a) => (
                <div key={a.id} className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{a.title}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      a.type === "CRITICAL" || a.type === "FLAME" || a.type === "FIRE" ? "border-risk-critical/40 text-risk-critical" :
                      a.type === "WARNING"  || a.type === "GAS_CRITICAL"               ? "border-risk-medium/40  text-risk-medium"    :
                      "border-border text-muted-foreground"
                    }`}>{a.type}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{a.message}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Site Sensor Widget  (replaces Vehicle Monitor)
// ─────────────────────────────────────────────────────
function SensorWidget() {
  const [latest,  setLatest]  = useState<SensorReading | null>(null);
  const [online,  setOnline]  = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchSensor() {
    try {
      const r = await fetch("/api/data");
      const j = await r.json();
      if (j.ok && j.data?.latest) {
        setLatest(j.data.latest);
        const age = Date.now() - new Date(j.data.latest.recordedAt).getTime();
        setOnline(age < 30_000);
      } else {
        setOnline(false);
      }
    } catch { setOnline(false); }
    setLoaded(true);
  }

  useEffect(() => {
    fetchSensor();
    timerRef.current = setInterval(fetchSensor, 8_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  type LedColor = "green" | "yellow" | "red" | "gray";
  function led(): LedColor {
    if (!latest || !online) return "gray";
    if (latest.temperature >= 40 || latest.gasVal > 50) return "red";
    if (latest.temperature >= 35) return "yellow";
    return "green";
  }
  const color = led();
  const LED_BG: Record<LedColor, string> = {
    green: "bg-green-500", yellow: "bg-yellow-400",
    red: "bg-red-500",     gray: "bg-muted-foreground/30",
  };
  const LABEL: Record<LedColor, string> = {
    green: "Normal", yellow: "Warning", red: "DANGER", gray: "No Signal",
  };
  const LABEL_COLOR: Record<LedColor, string> = {
    green: "text-green-400", yellow: "text-yellow-400",
    red: "text-red-400",     gray: "text-muted-foreground",
  };

  if (!loaded) return null;

  return (
    <div className={cn(
      "rounded-2xl border bg-background/60 backdrop-blur p-4",
      color === "red" ? "border-red-500/40" : "border-border/40"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Site Sensor Monitor</span>
          {latest && (
            <span className="text-[10px] text-muted-foreground font-mono">{latest.deviceCode}</span>
          )}
        </div>
        <div className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
          online
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-border/40 text-muted-foreground"
        )}>
          {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
          {online ? "Online" : "Offline"}
        </div>
      </div>

      {latest?.gasVal > 50 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">CRITICAL GAS LEVEL — {latest.gasVal} ppm</span>
        </div>
      )}
      {latest?.temperature >= 40 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">HIGH TEMPERATURE — {latest.temperature.toFixed(1)}°C</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
        <div className="flex flex-col items-center gap-2">
          <div className={cn("h-9 w-9 rounded-full", LED_BG[color], color !== "gray" ? "shadow-md" : "")} />
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", LABEL_COLOR[color])}>
            {LABEL[color]}
          </span>
        </div>
        <SensorTile
          icon={<Thermometer className="h-3.5 w-3.5" />}
          label="Temp"
          value={latest ? `${latest.temperature.toFixed(1)}°C` : "—"}
          warn={!!latest && latest.temperature >= 35}
          crit={!!latest && latest.temperature >= 40}
        />
        <SensorTile
          icon={<Wind className="h-3.5 w-3.5" />}
          label="Gas"
          value={latest ? `${latest.gasVal} ppm` : "—"}
          warn={!!latest && latest.gasVal > 30}
          crit={!!latest && latest.gasVal > 50}
        />
        <SensorTile
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Voltage"
          value={latest ? `${latest.voltage.toFixed(2)} V` : "—"}
          warn={false}
          crit={false}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/20 pt-3">
        <span>{online ? "Live readings from site sensors" : "Awaiting sensor data..."}</span>
        <a href="/operations/sensors" className="text-primary hover:underline">
          Full monitor →
        </a>
      </div>
    </div>
  );
}

function SensorTile({ icon, label, value, warn, crit }: {
  icon: React.ReactNode; label: string; value: string; warn: boolean; crit: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border px-3 py-3 text-center",
      crit ? "border-red-500/30 bg-red-500/5" :
      warn ? "border-yellow-400/30 bg-yellow-400/5" :
             "border-border/30"
    )}>
      <div className={cn(
        "flex items-center justify-center gap-1 text-[9px] uppercase tracking-wide mb-1.5",
        crit ? "text-red-400" : warn ? "text-yellow-400" : "text-muted-foreground"
      )}>
        {icon} {label}
      </div>
      <div className={cn(
        "font-display text-base tabular-nums",
        crit ? "text-red-400" : warn ? "text-yellow-400" : ""
      )}>{value}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof Activity; label: string; value: number | string;
  tone: "critical" | "warning" | "info" | "success";
}) {
  const colors = {
    critical: "border-risk-critical/40 text-risk-critical",
    warning:  "border-risk-medium/40  text-risk-medium",
    info:     "border-primary/40       text-primary",
    success:  "border-risk-low/40      text-risk-low",
  };
  return (
    <Card className={`glass border ${colors[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className="mt-2 font-display text-3xl num">{value}</div>
      </CardContent>
    </Card>
  );
}
