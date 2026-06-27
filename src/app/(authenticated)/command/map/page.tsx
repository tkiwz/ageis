"use client";

import dynamic from "next/dynamic";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle, MapPin, ShieldAlert, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const SitesMap = dynamic(
  () => import("@/components/command/sites-map").then((m) => m.SitesMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface Site {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  status: string;
  riskLevel: string;
  latitude: number | null;
  longitude: number | null;
  activeIncidents: number;
  activePermits: number;
  sensorCount: number;
}

export default function CommandMapPage() {
  const { data: sites, loading } = useApi<Site[]>("/api/sites", { refreshMs: 30000 });

  const totalIncidents = sites?.reduce((sum, s) => sum + s.activeIncidents, 0) ?? 0;
  const totalPermits   = sites?.reduce((sum, s) => sum + s.activePermits, 0) ?? 0;
  const criticalSites  = sites?.filter((s) => s.riskLevel === "CRITICAL").length ?? 0;
  const highRiskSites  = sites?.filter((s) => s.riskLevel === "HIGH").length ?? 0;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">Site Map</h1>
        <p className="text-sm text-muted-foreground">Real-time view of HSSE operations across Oman</p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Sites"      value={sites?.length ?? 0} icon={MapPin} />
        <Kpi label="Active Incidents" value={totalIncidents}     icon={AlertTriangle} tone={totalIncidents > 0 ? "critical" : undefined} />
        <Kpi label="Critical Risk"    value={criticalSites}      icon={ShieldAlert}   tone={criticalSites > 0 ? "critical" : undefined} />
        <Kpi label="High Risk"        value={highRiskSites}      icon={Activity}      tone={highRiskSites > 0 ? "warning" : undefined} />
      </div>

      <Card className="glass overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[600px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <SitesMap sites={sites ?? []} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-border/40 bg-muted/10 p-3 text-xs">
            <span className="font-medium text-muted-foreground">Risk Level:</span>
            <Legend color="#ef4444" label="Critical" />
            <Legend color="#f59e0b" label="High" />
            <Legend color="#eab308" label="Medium" />
            <Legend color="#10b981" label="Low" />
            <span className="ml-auto text-muted-foreground">
              Pulse indicates active incidents · Click marker for details
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof MapPin; tone?: "critical" | "warning";
}) {
  return (
    <Card className="glass">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={cn(
          "mt-1 font-display text-2xl num",
          tone === "critical" && "text-risk-critical",
          tone === "warning"  && "text-risk-medium"
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-3 h-3 rounded-full border-2 border-white"
        style={{ background: color, boxShadow: `0 0 0 1.5px ${color}66` }}
      />
      <span>{label}</span>
    </div>
  );
}