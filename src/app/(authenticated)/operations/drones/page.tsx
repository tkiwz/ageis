"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, RotateCcw, Play, AlertTriangle, Flame, Shield, Siren, Activity, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapDrone, MapDetection } from "@/components/drones/drone-map";

const DroneMap = dynamic(
  () => import("@/components/drones/drone-map").then((m) => ({ default: m.DroneMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-black/60">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading satellite map...
        </div>
      </div>
    ),
  }
);

type DroneStatus = "PATROLLING" | "IDLE" | "RETURNING" | "CHARGING";

interface Drone extends MapDrone {
  name: string;
  siteName: string;
  altitude: number;
  speed: number;
  waypointIdx: number;
}

interface DetectionEvent extends MapDetection {
  droneCode: string;
  siteName: string;
}

const INITIAL_DRONES: Drone[] = [
  {
    id: "drn-001", code: "DRN-001", name: "Eagle-1", siteName: "Khazzan",
    lat: 22.52, lng: 56.82, homeLat: 22.50, homeLng: 56.80,
    battery: 87, status: "PATROLLING", waypointIdx: 0, altitude: 120, speed: 45,
    waypoints: [
      { lat: 22.56, lng: 56.84 }, { lat: 22.62, lng: 56.91 },
      { lat: 22.58, lng: 56.98 }, { lat: 22.47, lng: 56.95 },
      { lat: 22.43, lng: 56.87 }, { lat: 22.50, lng: 56.80 },
    ],
  },
  {
    id: "drn-002", code: "DRN-002", name: "Falcon-2", siteName: "Makarem",
    lat: 23.10, lng: 57.20, homeLat: 23.10, homeLng: 57.20,
    battery: 62, status: "IDLE", waypointIdx: 0, altitude: 0, speed: 0,
    waypoints: [
      { lat: 23.16, lng: 57.26 }, { lat: 23.22, lng: 57.33 },
      { lat: 23.18, lng: 57.40 }, { lat: 23.08, lng: 57.38 },
      { lat: 23.03, lng: 57.28 }, { lat: 23.10, lng: 57.20 },
    ],
  },
  {
    id: "drn-003", code: "DRN-003", name: "Hawk-3", siteName: "Block 60",
    lat: 21.85, lng: 57.10, homeLat: 21.80, homeLng: 57.05,
    battery: 28, status: "RETURNING", waypointIdx: 0, altitude: 80, speed: 38,
    waypoints: [
      { lat: 21.90, lng: 57.14 }, { lat: 21.95, lng: 57.10 },
      { lat: 21.92, lng: 57.04 }, { lat: 21.83, lng: 57.01 },
      { lat: 21.80, lng: 57.05 },
    ],
  },
];

const STEP = 0.007;
const BATTERY_DRAIN = 0.012;
const BATTERY_CHARGE = 0.08;
const TICK_MS = 250;

function moveTo(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  if (dist < STEP * 0.5) return { lat: to.lat, lng: to.lng, reached: true };
  const ratio = STEP / dist;
  return { lat: from.lat + dLat * ratio, lng: from.lng + dLng * ratio, reached: false };
}

export default function DronesPage() {
  const [drones, setDrones] = useState<Drone[]>(INITIAL_DRONES);
  const [selected, setSelected] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectionEvent[]>([]);
  const [flashDrone, setFlashDrone] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(true);

  useEffect(() => {
    if (!simRunning) return;
    const interval = setInterval(() => {
      setDrones((prev) =>
        prev.map((d) => {
          let { lat, lng, battery, status, waypointIdx, altitude, speed } = d;
          if (status === "IDLE" || status === "CHARGING") {
            battery = Math.min(100, battery + BATTERY_CHARGE);
            return { ...d, battery, altitude: 0, speed: 0 };
          }
          battery = Math.max(0, battery - BATTERY_DRAIN);
          if (battery < 10 && status !== "RETURNING") status = "RETURNING";
          const target = status === "RETURNING"
            ? { lat: d.homeLat, lng: d.homeLng }
            : d.waypoints[waypointIdx % d.waypoints.length];
          const moved = moveTo({ lat, lng }, target);
          lat = moved.lat; lng = moved.lng;
          if (moved.reached) {
            if (status === "RETURNING") {
              status = battery < 35 ? "CHARGING" : "IDLE";
              lat = d.homeLat; lng = d.homeLng;
              altitude = 0; speed = 0;
            } else {
              waypointIdx = (waypointIdx + 1) % d.waypoints.length;
            }
          }
          if (status === "PATROLLING") {
            altitude = 100 + Math.sin(Date.now() / 3000) * 15;
            speed = 40 + Math.sin(Date.now() / 2000) * 8;
          } else if (status === "RETURNING") {
            altitude = 80; speed = 35;
          }
          return { ...d, lat, lng, battery, status, waypointIdx, altitude, speed };
        })
      );
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [simRunning]);

  function recall(id: string) {
    setDrones((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "RETURNING" as DroneStatus, waypointIdx: 0 } : d))
    );
  }

  function deploy(id: string) {
    setDrones((prev) =>
      prev.map((d) =>
        d.id === id && (d.status === "IDLE" || d.status === "CHARGING")
          ? { ...d, status: "PATROLLING" as DroneStatus, altitude: 100 }
          : d
      )
    );
  }

  async function triggerScenario(type: DetectionEvent["type"]) {
    const drone = drones.find((d) => d.status === "PATROLLING") ?? drones[0];
    const severity = type === "OIL_LEAK" || type === "GAS_LEAK" ? "CRITICAL" : "HIGH";

    const event: DetectionEvent = {
      id: `det-${Date.now()}`,
      droneCode: drone.code,
      type,
      siteName: drone.siteName,
      severity,
      timestamp: new Date(),
      lat: drone.lat,
      lng: drone.lng,
    };

    setDetections((prev) => [event, ...prev].slice(0, 30));
    setFlashDrone(drone.id);
    setTimeout(() => setFlashDrone(null), 2500);

    const emoji: Record<string, string> = {
      OIL_LEAK: "🛢️", GAS_LEAK: "💨",
      PPE_VIOLATION: "🦺", PERIMETER_BREACH: "🚧",
    };

    const waMsg =
      `${emoji[type] ?? "⚠️"} *AEGIS ALERT — ${severity}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🛸 Drone: ${drone.code} (${drone.name})\n` +
      `⚠️ Detection: ${type.replace(/_/g, " ")}\n` +
      `📍 Site: ${drone.siteName}\n` +
      `🗺️ Position: ${drone.lat.toFixed(4)}N, ${drone.lng.toFixed(4)}E\n` +
      `🔋 Battery: ${drone.battery.toFixed(0)}%\n` +
      `⏰ Time: ${new Date().toLocaleTimeString()}\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `_AEGIS HSSE Platform — Oman_`;

    await Promise.allSettled([
      fetch("/api/notify/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: waMsg }),
      }),
      fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: severity === "CRITICAL" ? "CRITICAL" : "WARNING",
          title: `🛸 Drone: ${type.replace(/_/g, " ")}`,
          message: `${drone.code} detected ${type.replace(/_/g, " ")} near ${drone.siteName}.`,
          isAutonomous: true,
        }),
      }),
    ]);
  }

  const patrolCount = drones.filter((d) => d.status === "PATROLLING").length;
  const returningCount = drones.filter((d) => d.status === "RETURNING").length;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
            <Radio className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Drone Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-risk-low">{patrolCount} patrolling</span>
              {returningCount > 0 && <span className="text-risk-medium"> · {returningCount} returning</span>}
              {" · "}{detections.length} detections
            </p>
          </div>
        </div>
        <Button size="sm" variant={simRunning ? "default" : "outline"} onClick={() => setSimRunning((r) => !r)}>
          {simRunning ? "⏸ Pause" : "▶ Resume"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="glass overflow-hidden" style={{ height: 560 }}>
            <DroneMap
              drones={drones}
              selectedId={selected}
              onSelect={setSelected}
              flashDrone={flashDrone}
              detections={detections}
            />
          </Card>

          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Scenario Simulator
                <span className="font-normal text-[10px] text-muted-foreground">— WhatsApp + DB alert</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { type: "PPE_VIOLATION",    label: "PPE Violation",    icon: Shield,        color: "warning"  },
                  { type: "OIL_LEAK",         label: "Oil Leak",         icon: AlertTriangle, color: "critical" },
                  { type: "GAS_LEAK",         label: "Gas Leak",         icon: Flame,         color: "critical" },
                  { type: "PERIMETER_BREACH", label: "Perimeter Breach", icon: Siren,         color: "warning"  },
                ] as const).map((s) => (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => triggerScenario(s.type)}
                    className={cn(
                      "rounded-md border p-3 text-left text-xs font-medium transition-colors",
                      s.color === "critical"
                        ? "border-risk-critical/40 bg-risk-critical/5 text-risk-critical hover:bg-risk-critical/15"
                        : "border-risk-medium/40 bg-risk-medium/5 text-risk-medium hover:bg-risk-medium/15"
                    )}
                  >
                    <s.icon className="mb-1.5 h-4 w-4" />
                    {s.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          {drones.map((d) => {
            const isFlying = d.status === "PATROLLING" || d.status === "RETURNING";
            const batColor = d.battery < 20 ? "bg-risk-critical" : d.battery < 40 ? "bg-risk-medium" : "bg-risk-low";
            const statusColor = d.status === "PATROLLING" ? "text-risk-low"
              : d.status === "RETURNING" ? "text-risk-medium"
              : d.status === "CHARGING" ? "text-primary"
              : "text-muted-foreground";
            return (
              <Card
                key={d.id}
                className={cn("glass cursor-pointer transition-all", selected === d.id && "ring-1 ring-primary")}
                onClick={() => setSelected(d.id === selected ? null : d.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{d.code} — {d.name}</div>
                      <div className={cn("text-[10px] uppercase tracking-wider", statusColor)}>{d.status}</div>
                    </div>
                    {isFlying ? (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                        onClick={(e) => { e.stopPropagation(); recall(d.id); }}>
                        <RotateCcw className="mr-1 h-3 w-3" /> Recall
                      </Button>
                    ) : (
                      <Button size="sm" className="h-7 px-2 text-[11px]" disabled={d.battery < 15}
                        onClick={(e) => { e.stopPropagation(); deploy(d.id); }}>
                        <Play className="mr-1 h-3 w-3" /> Deploy
                      </Button>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Battery</span>
                      <span className="num">{d.battery.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full transition-all", batColor)} style={{ width: `${d.battery}%` }} />
                    </div>
                  </div>
                  {isFlying && (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                      <div>
                        <div className="text-muted-foreground">Alt</div>
                        <div className="num font-medium">{d.altitude.toFixed(0)}m</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Speed</div>
                        <div className="num font-medium">{d.speed.toFixed(0)}<span className="text-[8px]">km/h</span></div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Site</div>
                        <div className="font-medium truncate">{d.siteName}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detection Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-52">
                <div className="space-y-1.5 px-4 pb-4">
                  {detections.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Press a scenario to simulate.
                    </p>
                  )}
                  {detections.map((det) => (
                    <div key={det.id} className={cn(
                      "rounded-md border p-2 text-xs",
                      det.severity === "CRITICAL"
                        ? "border-risk-critical/40 bg-risk-critical/5"
                        : "border-risk-medium/40 bg-risk-medium/5"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className={cn("font-semibold",
                          det.severity === "CRITICAL" ? "text-risk-critical" : "text-risk-medium")}>
                          {det.type.replace(/_/g, " ")}
                        </span>
                        <span className="num text-[10px] text-muted-foreground">
                          {det.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {det.droneCode} · {det.siteName}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}