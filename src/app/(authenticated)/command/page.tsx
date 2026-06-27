"use client";

import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertsFeed } from "@/components/dashboard/alerts-feed";
import { SensorsGrid } from "@/components/dashboard/sensors-grid";
import { Card, CardContent } from "@/components/ui/card";
import { Siren, Map as MapIcon, LayoutDashboard, Activity, Radio, AlertTriangle, ArrowRight } from "lucide-react";

interface DashboardKpis {
  activeSites: number;
  onlineSensors: number;
  totalSensors: number;
  openIncidents: number;
  activeEmergencies: number;
}

export default function CommandCenterPage() {
  const { data, loading } = useApi<DashboardKpis>("/api/dashboard", { refreshMs: 10000 });

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
          <Siren className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real-time operations · Refreshes every 10s</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Activity} label="Active Sites" value={data?.activeSites ?? 0} variant="success" loading={loading} />
        <KpiCard icon={Radio} label="Online Sensors" value={data?.onlineSensors ?? 0} total={data?.totalSensors} variant="primary" loading={loading} />
        <KpiCard icon={AlertTriangle} label="Open Incidents" value={data?.openIncidents ?? 0} variant={data && data.openIncidents > 0 ? "warning" : "success"} loading={loading} />
        <KpiCard icon={Siren} label="Active Emergencies" value={data?.activeEmergencies ?? 0} variant={data && data.activeEmergencies > 0 ? "danger" : "success"} loading={loading} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink href="/dashboard" icon={LayoutDashboard} title="Executive Dashboard" description="Full KPI overview with all modules" />
        <QuickLink href="/command/map" icon={MapIcon} title="Site Map" description="Geographic view of all sites" />
        <QuickLink href="/command/emergencies" icon={Siren} title="Emergencies" description={data ? `${data.activeEmergencies} active` : "View emergencies"} danger={data?.activeEmergencies ? data.activeEmergencies > 0 : false} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <AlertsFeed />
        <SensorsGrid />
      </div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, description, danger }: {
  href: string; icon: typeof MapIcon; title: string; description: string; danger?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={danger ? "glass border-risk-critical/30 hover:bg-risk-critical/5 transition-colors cursor-pointer" : "glass hover:bg-accent/30 transition-colors cursor-pointer"}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={danger ? "rounded-md border border-risk-critical/40 bg-risk-critical/10 p-2 text-risk-critical" : "rounded-md border border-primary/20 bg-primary/10 p-2 text-primary"}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
