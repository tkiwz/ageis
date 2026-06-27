"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, MapPin } from "lucide-react";
import { cn, riskColor } from "@/lib/utils";
import { PRODUCTION_TYPES } from "@/lib/constants";

interface Site {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  productionType: string;
  riskLevel: string;
  status: string;
  latitude: number;
  longitude: number;
  capacity: number;
  currentOccupancy: number;
  occupancyPercent: number;
  counts: { openIncidents: number; activePermits: number; totalSensors: number; onlineSensors: number; activeEmergencies: number };
}

export function SitesOverview() {
  const { data, loading } = useApi<Site[]>("/api/sites", { refreshMs: 30000 });
  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-4 w-4 text-primary" />
            Work Sites
          </CardTitle>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{data?.length ?? 0} sites</span>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading sites...</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((site) => {
            const prodType = PRODUCTION_TYPES[site.productionType];
            const hasEmergency = site.counts.activeEmergencies > 0;
            return (
              <div key={site.id} className={cn(
                "rounded-md border p-3 transition-colors hover:bg-accent/30",
                hasEmergency ? "border-risk-critical/40 bg-risk-critical/5 glow-critical" : "border-border/50 bg-background/30")}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{site.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />
                      {site.code}
                      {prodType && (<><span>·</span><span>{prodType.en}</span></>)}
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase", riskColor(site.riskLevel))}>{site.riskLevel}</span>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Occupancy</span>
                    <span className="num">{site.currentOccupancy} / {site.capacity}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full transition-all",
                      site.occupancyPercent >= 90 ? "bg-risk-critical"
                      : site.occupancyPercent >= 75 ? "bg-risk-medium"
                      : "bg-risk-low")} style={{ width: `${site.occupancyPercent}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <StatBox label="Incidents" value={site.counts.openIncidents} danger={site.counts.openIncidents > 0} />
                  <StatBox label="Permits" value={site.counts.activePermits} />
                  <StatBox label="Sensors" value={`${site.counts.onlineSensors}/${site.counts.totalSensors}`} />
                </div>
                {hasEmergency && (
                  <div className="mt-2 rounded border border-risk-critical/40 bg-risk-critical/10 px-2 py-1 text-center text-[10px] font-medium text-risk-critical">
                    🚨 {site.counts.activeEmergencies} ACTIVE EMERGENCY
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div className={cn("rounded border p-1.5", danger ? "border-risk-critical/40 bg-risk-critical/10 text-risk-critical" : "border-border/40 bg-muted/30")}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num text-xs font-semibold", danger ? "" : "text-foreground")}>{value}</div>
    </div>
  );
}
