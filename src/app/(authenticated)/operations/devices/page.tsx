"use client";

import { useApi } from "@/hooks/use-api";
import { DeviceCard } from "@/components/devices/device-card";
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Camera, Radio, Wifi } from "lucide-react";
import type { FieldDeviceListItem } from "@/types/devices";

export default function DevicesPage() {
  const { data: devices, loading } = useApi<FieldDeviceListItem[]>("/api/devices", {
    refreshMs: 15000,
  });

  const onlineCount = devices?.filter((d) => d.status === "ONLINE").length ?? 0;
  const piCount = devices?.filter((d) => d.type === "PI_VISION").length ?? 0;
  const espCount = devices?.filter((d) => d.type === "ESP32_WEARABLE").length ?? 0;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
          <Cpu className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Field Devices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wifi} label="Online" value={onlineCount} total={devices?.length ?? 0} variant="success" />
        <StatCard icon={Cpu} label="Total Devices" value={devices?.length ?? 0} />
        <StatCard icon={Camera} label="Pi Vision" value={piCount} />
        <StatCard icon={Radio} label="ESP32 Wearable" value={espCount} />
      </div>

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading devices...</div>
      )}

      {!loading && (!devices || devices.length === 0) && (
        <Card className="glass">
          <CardContent className="py-12 text-center">
            <Cpu className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-3 text-lg font-medium">No devices registered</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the seed script to add the default Raspberry Pi.
            </p>
            <pre className="mx-auto mt-4 max-w-md rounded-md border border-border/40 bg-muted/40 p-3 text-left text-xs font-mono">
              npx tsx prisma/seed-devices.ts
            </pre>
          </CardContent>
        </Card>
      )}

      {devices && devices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, total, variant }: {
  icon: typeof Cpu;
  label: string;
  value: number;
  total?: number;
  variant?: "success";
}) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="num mt-1 flex items-baseline gap-1">
              <span className={variant === "success" ? "text-2xl font-semibold text-risk-low" : "text-2xl font-semibold"}>
                {value}
              </span>
              {total !== undefined && (
                <span className="text-sm text-muted-foreground">/ {total}</span>
              )}
            </div>
          </div>
          <div className={variant === "success" ? "rounded-md border border-risk-low/30 bg-risk-low/10 p-2" : "rounded-md border border-primary/20 bg-primary/10 p-2"}>
            <Icon className={variant === "success" ? "h-4 w-4 text-risk-low" : "h-4 w-4 text-primary"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
