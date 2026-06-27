"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface SensorDevice {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  location: string | null;
  unit: string;
  siteName: string;
  thresholds: { warningHigh: number | null; criticalHigh: number | null; warningLow: number | null; criticalLow: number | null };
  latestReading: { value: number; alertLevel: string | null; isAnomaly: boolean; recordedAt: string } | null;
  lastReadingAt: string | null;
}

interface SensorsResponse {
  devices: SensorDevice[];
  summary: { total: number; online: number; offline: number; maintenance: number; anomalies: number };
}

export function SensorsGrid() {
  const { data, loading } = useApi<SensorsResponse>("/api/sensors", { refreshMs: 10000 });

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            IoT Sensors
          </CardTitle>
          {data && (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {data.summary.online}/{data.summary.total} online
              {data.summary.anomalies > 0 && <span className="ml-2 text-risk-critical">· {data.summary.anomalies} anomalies</span>}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading sensors...</div>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.devices.slice(0, 12).map((device) => <SensorTile key={device.id} device={device} />)}
        </div>
        {data && data.devices.length > 12 && (
          <div className="mt-3 text-center text-xs text-muted-foreground">
            Showing 12 of {data.devices.length} sensors
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SensorTile({ device }: { device: SensorDevice }) {
  const reading = device.latestReading;
  const isOffline = device.status !== "ONLINE";
  const alertLevel = reading?.alertLevel ?? "NORMAL";
  const dotClass = isOffline ? "status-offline"
    : alertLevel === "CRITICAL" ? "bg-risk-critical glow-critical"
    : alertLevel === "WARNING" ? "bg-risk-medium"
    : "status-online";
  const borderClass = alertLevel === "CRITICAL" ? "border-risk-critical/40 bg-risk-critical/5"
    : alertLevel === "WARNING" ? "border-risk-medium/40 bg-risk-medium/5"
    : "border-border/40";

  return (
    <div className={cn("rounded-md border p-2.5", borderClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("status-dot", dotClass)} />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
          {device.type.replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-1 truncate text-[11px] font-medium">{device.name}</div>
      <div className="mt-2 flex items-baseline gap-1">
        {reading ? (
          <>
            <span className={cn("num text-lg font-semibold",
              alertLevel === "CRITICAL" ? "text-risk-critical"
              : alertLevel === "WARNING" ? "text-risk-medium"
              : "text-foreground")}>{reading.value.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{device.unit}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No data</span>
        )}
      </div>
      <div className="mt-1 truncate text-[9px] text-muted-foreground/70">{device.siteName}</div>
    </div>
  );
}
