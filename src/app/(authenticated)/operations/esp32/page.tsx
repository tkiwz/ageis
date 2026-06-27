"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wind, Thermometer, Gauge, Battery, Activity, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import Link from "next/link";

interface Device {
  id: string;
  code: string;
  name: string;
  status: string;
  batteryPercent: number | null;
  lastSeenAt: string | null;
}

interface Latest {
  temperature:  number | null;
  pressure:     number | null;
  gasLevel:     number | null;
  voltage:      number | null;
  currentMa:    number | null;
  acceleration: number | null;
  alertActive:  boolean;
  recordedAt:   string;
}

interface HistoryRow {
  gasLevel:    number | null;
  temperature: number | null;
  alertActive: boolean;
  recordedAt:  string;
}

interface Telemetry {
  device:  Device;
  latest:  Latest | null;
  history: HistoryRow[];
}

interface Incident {
  id: string;
  incidentNumber: string;
  title: string;
  severity: string;
  occurredAt: string;
}

export default function ESP32LivePage() {
  const [deviceId, setDeviceId]   = useState<string | null>(null);
  const [data, setData]           = useState<Telemetry | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [debug, setDebug]         = useState<string>("Starting...");

  useEffect(() => {
    async function findDevice() {
      try {
        setDebug("Fetching device list...");
        const res  = await fetch("/api/devices", { credentials: "include" });
        const json = await res.json();
        console.log("[ESP32 Page] /api/devices response:", json);

        const list = Array.isArray(json.data) ? json.data : (json.data?.devices ?? []);
        const esp  = list.find((d: { code: string }) => d.code === "ESP-001");

        if (esp) {
          setDebug(`Found ESP-001 (id: ${esp.id})`);
          setDeviceId(esp.id);
        } else {
          setDebug(`ESP-001 not found. Got ${list.length} devices.`);
          setLoading(false);
        }
      } catch (err) {
        setDebug(`Error fetching devices: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    }
    findDevice();
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    async function fetchData() {
      try {
        const [tRes, iRes] = await Promise.all([
          fetch(`/api/devices/esp/${deviceId}/latest`, { credentials: "include" }),
          fetch(`/api/incidents?limit=10`, { credentials: "include" }),
        ]);
        const tJson = await tRes.json();
        const iJson = await iRes.json();
        console.log("[ESP32 Page] /latest response:", tJson);
        console.log("[ESP32 Page] /incidents response:", iJson);

        if (tJson.ok && tJson.data) {
          setData(tJson.data);
          setDebug(`Live: ${tJson.data.history?.length ?? 0} readings`);
        } else {
          setDebug(`Latest API error: ${tJson.error?.message ?? "Unknown"}`);
        }

        if (iJson.ok && iJson.data) {
          const list = Array.isArray(iJson.data) ? iJson.data : (iJson.data?.incidents ?? []);
          const espIncidents = list
            .filter((inc: { incidentNumber: string }) => inc.incidentNumber?.startsWith("INC-ESP"))
            .slice(0, 5);
          setIncidents(espIncidents);
        }
        setLoading(false);
      } catch (err) {
        setDebug(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [deviceId]);

  if (loading && !data) {
    return (
      <div className="container mx-auto px-6 py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-2 text-xs text-muted-foreground">{debug}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
        <p>ESP-001 device not found.</p>
        <p className="mt-2 text-xs">{debug}</p>
      </div>
    );
  }

  const latest    = data.latest;
  const isOnline  = data.device.status === "ONLINE";
  const lastSeen  = data.device.lastSeenAt ? new Date(data.device.lastSeenAt).getTime() : 0;
  const ageSecs   = Math.floor((Date.now() - lastSeen) / 1000);
  const isFresh   = ageSecs < 30;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight">ESP32 Live Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            {data.device.code} — {data.device.name}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">{debug}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            isFresh && isOnline
              ? "border-risk-low/40 bg-risk-low/5 text-risk-low"
              : "border-risk-critical/40 bg-risk-critical/5 text-risk-critical"
          )}>
            {isFresh && isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isFresh && isOnline ? "Live" : `${ageSecs}s ago`}
          </div>
          {data.device.batteryPercent !== null && (
            <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-xs">
              <Battery className="h-3 w-3" />
              <span className="num">{data.device.batteryPercent}%</span>
            </div>
          )}
        </div>
      </div>

      {latest ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <GaugeCard icon={Wind}        label="Gas Level"   value={latest.gasLevel    ?? 0} unit="ppm" thresholds={[200, 400]}    max={1000} />
            <GaugeCard icon={Thermometer} label="Temperature" value={latest.temperature ?? 0} unit="C"   thresholds={[40, 55]}       max={80}   />
            <GaugeCard icon={Gauge}       label="Pressure"    value={latest.pressure    ?? 0} unit="hPa" thresholds={[1100, 1150]}   max={1200} />
            <GaugeCard icon={Battery}     label="Voltage"     value={latest.voltage     ?? 0} unit="V"   thresholds={[3.3, 3.0]} reverse max={4.2} />
          </div>

          <Card className="glass mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4" /> Gas Level Trend
                <span className="text-[10px] font-normal text-muted-foreground">
                  Last {data.history?.length ?? 0} readings
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline data={data.history ?? []} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Recent Readings</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {(data.history ?? []).slice(0, 15).map((h, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground num">
                        {new Date(h.recordedAt).toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className={cn("num", (h.gasLevel ?? 0) >= 200 ? "text-risk-high" : "")}>
                          {(h.gasLevel ?? 0).toFixed(0)} ppm
                        </span>
                        <span className={cn("num", (h.temperature ?? 0) >= 40 ? "text-risk-high" : "")}>
                          {(h.temperature ?? 0).toFixed(1)}C
                        </span>
                        {h.alertActive && <AlertTriangle className="h-3 w-3 text-risk-critical" />}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Auto-Generated Incidents</CardTitle></CardHeader>
              <CardContent>
                {incidents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No incidents yet. System is monitoring.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {incidents.map((inc) => (
                      <Link key={inc.id} href={`/safety/incidents/${inc.id}`}
                        className="block rounded-md border border-border/40 bg-muted/10 px-3 py-2 hover:bg-muted/30 transition">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{inc.title}</span>
                          <span className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            inc.severity === "CRITICAL"
                              ? "border-risk-critical/40 text-risk-critical bg-risk-critical/5"
                              : "border-risk-high/40 text-risk-high bg-risk-high/5"
                          )}>{inc.severity}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="num">{inc.incidentNumber}</span>
                          <span>{timeAgo(inc.occurredAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-border/40 bg-muted/10 p-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Waiting for first reading...</p>
        </div>
      )}
    </div>
  );
}

function GaugeCard({ icon: Icon, label, value, unit, thresholds, reverse, max }: {
  icon: typeof Wind; label: string; value: number; unit: string;
  thresholds: [number, number]; reverse?: boolean; max: number;
}) {
  const [warning, critical] = thresholds;
  let level: "ok" | "warn" | "crit" = "ok";
  if (reverse) {
    if (value <= critical) level = "crit";
    else if (value <= warning) level = "warn";
  } else {
    if (value >= critical) level = "crit";
    else if (value >= warning) level = "warn";
  }
  const colorClass = {
    ok:   "border-risk-low/40 text-risk-low",
    warn: "border-risk-medium/40 text-risk-medium",
    crit: "border-risk-critical/40 text-risk-critical bg-risk-critical/5",
  }[level];
  const fillPct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <Card className={cn("glass border", colorClass)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-3xl num">
            {value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full transition-all duration-500",
            level === "ok"   && "bg-risk-low",
            level === "warn" && "bg-risk-medium",
            level === "crit" && "bg-risk-critical")}
            style={{ width: `${fillPct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ data }: { data: HistoryRow[] }) {
  if (!data || data.length === 0) {
    return <div className="text-center text-xs text-muted-foreground py-8">No data yet</div>;
  }
  const points = [...data].reverse();
  const max = Math.max(...points.map((p) => p.gasLevel ?? 0), 100);
  const width = 800, height = 80, padX = 10;
  const linePoints = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2);
    const y = height - ((p.gasLevel ?? 0) / max) * (height - 10);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
      <line x1={0} x2={width}
        y1={height - (200 / max) * (height - 10)} y2={height - (200 / max) * (height - 10)}
        stroke="hsl(var(--risk-medium))" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <line x1={0} x2={width}
        y1={height - (400 / max) * (height - 10)} y2={height - (400 / max) * (height - 10)}
        stroke="hsl(var(--risk-critical))" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round"
        points={linePoints} />
    </svg>
  );
}