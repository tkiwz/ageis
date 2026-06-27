"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Siren, Flame, AlertOctagon, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn, timeAgo, formatDateTime, riskColor } from "@/lib/utils";

interface Emergency {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  evacuationTriggered: boolean;
  droneDispatched: boolean;
  startedAt: string;
  resolvedAt: string | null;
  site: { code: string; name: string; nameAr: string | null };
  commandedBy: { name: string; role: string };
}

interface EmergenciesResponse {
  emergencies: Emergency[];
  summary: { total: number; active: number; contained: number; resolved: number; evacuations: number; dronesDispatched: number };
}

const typeIcons: Record<string, typeof Flame> = {
  FIRE: Flame, CHEMICAL_SPILL: AlertOctagon, GAS_LEAK: AlertOctagon,
  STRUCTURAL_FAILURE: ShieldAlert, SECURITY: ShieldAlert, WEATHER: AlertOctagon, BLOWOUT: AlertOctagon,
};

export default function EmergenciesPage() {
  const { data, loading } = useApi<EmergenciesResponse>("/api/emergencies", { refreshMs: 10000 });

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-md border border-risk-critical/30 bg-risk-critical/10 p-3 glow-critical">
          <Siren className="h-6 w-6 text-risk-critical" />
        </div>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Emergencies</h1>
          <p className="mt-1 text-sm text-muted-foreground">Command & Control · Real-time emergency tracking</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Siren} label="Active" value={data?.summary.active ?? 0} variant={data && data.summary.active > 0 ? "danger" : "success"} loading={loading} />
        <KpiCard icon={ShieldAlert} label="Contained" value={data?.summary.contained ?? 0} variant="warning" loading={loading} />
        <KpiCard icon={CheckCircle2} label="Resolved" value={data?.summary.resolved ?? 0} variant="success" loading={loading} />
        <KpiCard icon={AlertOctagon} label="Total Evacuations" value={data?.summary.evacuations ?? 0} loading={loading} />
      </div>

      <Card className="glass">
        <CardHeader><CardTitle className="text-base">Emergency Events</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-3 pr-3">
              {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>}
              {data?.emergencies.length === 0 && (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-risk-low" />
                  <p className="mt-3 text-sm text-muted-foreground">No emergency events</p>
                </div>
              )}
              {data?.emergencies.map((em) => {
                const Icon = typeIcons[em.type] ?? Siren;
                const isActive = em.status === "ACTIVE";
                return (
                  <div key={em.id} className={cn("rounded-md border p-4",
                    isActive ? "border-risk-critical/40 bg-risk-critical/5 glow-critical"
                    : em.status === "CONTAINED" ? "border-risk-medium/40 bg-risk-medium/5"
                    : "border-border/40")}>
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-md border p-2",
                        isActive ? "border-risk-critical/40 bg-risk-critical/10 text-risk-critical"
                        : "border-border bg-muted/40 text-muted-foreground")}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{em.title}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", riskColor(em.severity))}>{em.severity}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            isActive ? "border-risk-critical/40 bg-risk-critical/10 text-risk-critical animate-pulse-glow"
                            : em.status === "CONTAINED" ? "border-risk-medium/40 bg-risk-medium/10 text-risk-medium"
                            : "border-risk-low/40 bg-risk-low/10 text-risk-low")}>{em.status}</span>
                        </div>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                          <Info label="Type" value={em.type.replace(/_/g, " ")} />
                          <Info label="Site" value={em.site.name} />
                          <Info label="Started" value={timeAgo(em.startedAt)} sub={formatDateTime(em.startedAt)} />
                          <Info label="Commander" value={em.commandedBy.name} sub={em.commandedBy.role} />
                        </div>
                        {(em.evacuationTriggered || em.droneDispatched) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {em.evacuationTriggered && <span className="rounded-full border border-risk-critical/40 bg-risk-critical/10 px-2 py-0.5 text-[10px] text-risk-critical">🚨 Evacuation Triggered</span>}
                            {em.droneDispatched && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">🛸 Drone Dispatched</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xs font-medium">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
    </div>
  );
}
