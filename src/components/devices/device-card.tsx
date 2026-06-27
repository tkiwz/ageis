"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Radio, ArrowRight, Wifi, WifiOff } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { FieldDeviceListItem } from "@/types/devices";

export function DeviceCard({ device }: { device: FieldDeviceListItem }) {
  const isPi = device.type === "PI_VISION";
  const Icon = isPi ? Camera : Radio;
  const isOnline = device.status === "ONLINE";

  return (
    <Link href={`/operations/devices/${device.id}`}>
      <Card className="glass cursor-pointer transition-colors hover:bg-accent/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "rounded-md border p-2",
              isOnline ? "border-risk-low/40 bg-risk-low/10 text-risk-low" : "border-border bg-muted/30 text-muted-foreground",
            )}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{device.name}</span>
                {isOnline ? (
                  <Wifi className="h-3 w-3 shrink-0 text-risk-low" />
                ) : (
                  <WifiOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {device.code} · {device.type.replace("_", " ")}
              </div>
              {device.site && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  📍 {device.site.name}
                </div>
              )}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="IP" value={device.ipAddress ?? "—"} mono />
            <Stat label="Detections" value={device.detectionsCount.toString()} />
            <Stat label="Alerts" value={device.alertsCount.toString()} danger={device.alertsCount > 0} />
          </div>

          {device.lastSeenAt && (
            <div className="mt-2 text-[10px] text-muted-foreground/70">
              Last seen: {timeAgo(device.lastSeenAt)}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({ label, value, danger, mono }: { label: string; value: string; danger?: boolean; mono?: boolean }) {
  return (
    <div className={cn(
      "rounded border p-1.5",
      danger ? "border-risk-critical/40 bg-risk-critical/10" : "border-border/40 bg-muted/30",
    )}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "text-[11px] font-semibold truncate",
        danger ? "text-risk-critical" : "text-foreground",
        mono && "font-mono",
      )}>
        {value}
      </div>
    </div>
  );
}
