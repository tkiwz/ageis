"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { LiveVideoFeed } from "@/components/devices/live-video-feed";
import { DetectionFeed } from "@/components/devices/detection-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, MapPin, Activity, Cpu } from "lucide-react";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import type { FieldDeviceListItem } from "@/types/devices";

interface PiStats {
  ready: boolean;
  status?: string;
  top_class?: string;
  top_confidence?: number;
  fps?: number;
  all_scores?: Record<string, number>;
}

export default function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Get device info from list endpoint (we filter client-side)
  const { data: devices } = useApi<FieldDeviceListItem[]>("/api/devices", { refreshMs: 30000 });
  const device = devices?.find((d) => d.id === id);

  // Get live Pi stats
  const { data: stats } = useApi<PiStats>(`/api/devices/pi/${id}/stats`, {
    refreshMs: device?.status === "ONLINE" ? 3000 : 30000,
    enabled: device?.type === "PI_VISION",
  });

  if (!device) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading device...</p>
      </div>
    );
  }

  const isOnline = device.status === "ONLINE";
  const isPi = device.type === "PI_VISION";

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/operations/devices" className="hover:text-foreground">Devices</Link>
        <span>/</span>
        <span className="text-foreground">{device.code}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className={cn(
          "rounded-md border p-3",
          isOnline ? "border-risk-low/30 bg-risk-low/10 text-risk-low" : "border-border bg-muted/30 text-muted-foreground",
        )}>
          <Camera className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">{device.name}</h1>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
              isOnline ? "border-risk-low/40 bg-risk-low/10 text-risk-low" : "border-border bg-muted text-muted-foreground",
            )}>
              {device.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {device.code} · {device.type.replace("_", " ")}
            {device.site && (
              <> · <MapPin className="inline h-3 w-3" /> {device.site.name}</>
            )}
          </p>
        </div>
      </div>

      {/* Top stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="IP Address" value={device.ipAddress ?? "—"} mono />
        <Stat label="FPS" value={stats?.fps ? stats.fps.toFixed(1) : "—"} />
        <Stat label="Detections" value={device.detectionsCount.toString()} />
        <Stat label="AI Alerts" value={device.alertsCount.toString()} danger={device.alertsCount > 0} />
      </div>

      {/* Live current detection */}
      {stats?.ready && stats.top_class && (
        <Card className="glass mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Current Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-semibold uppercase",
                stats.status === "WARNING" ? "border-risk-critical/40 bg-risk-critical/10 text-risk-critical" :
                stats.status === "OK" ? "border-risk-low/40 bg-risk-low/10 text-risk-low" :
                "border-border bg-muted",
              )}>
                {stats.top_class}
              </div>
              <span className="text-sm text-muted-foreground num">
                {stats.top_confidence ? (stats.top_confidence * 100).toFixed(1) : 0}% confidence
              </span>
            </div>
            {stats.all_scores && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(stats.all_scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([label, score]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-24 truncate text-xs text-muted-foreground">{label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${score * 100}%` }}
                        />
                      </div>
                      <span className="num w-10 text-right text-[10px] text-muted-foreground">
                        {(score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Video feed + detection feed */}
      {isPi && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LiveVideoFeed deviceId={device.id} deviceName={device.name} online={isOnline} />
          </div>
          <div>
            <DetectionFeed deviceId={device.id} online={isOnline} autoAnalyze={true} />
          </div>
        </div>
      )}

      {/* Last seen */}
      {device.lastSeenAt && (
        <div className="mt-4 text-xs text-muted-foreground">
          Last seen: {timeAgo(device.lastSeenAt)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, danger, mono }: { label: string; value: string; danger?: boolean; mono?: boolean }) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={cn(
          "mt-1 text-xl font-semibold num",
          danger && "text-risk-critical",
          mono && "font-mono text-base",
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
