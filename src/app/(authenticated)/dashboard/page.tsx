"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AlertTriangle, BellRing, Building2, CheckCircle2, FileCheck2, Gauge, Siren, type LucideIcon } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { ForecastCard } from "@/components/dashboard/forecast-card";
import { WeatherCard } from "@/components/dashboard/weather-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TONE_DOT, TONE_TEXT, toneFor } from "@/lib/ui/tone";
import { ROLE_GROUPS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/constants";

interface DashboardData {
  activeSites: number;
  openIncidents: number;
  onlineSensors: number;
  totalSensors: number;
  criticalAlerts: number;
  activeEmergencies: number;
  pendingPermits: number;
  generatedAt: string;
}

interface AlertRow {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  site: { code: string; name: string } | null;
}

const SEVERITY_RANK: Record<string, number> = { EMERGENCY: 0, FIRE: 0, FLAME: 0, CRITICAL: 1, GAS_CRITICAL: 1, LEAK: 1, WARNING: 2, GAS_WARNING: 2, INFO: 3 };
const STALE_MS = 30_000;

export default function DashboardPage() {
  const { t } = useI18n();
  const denied = useSearchParams().get("denied") === "true";
  const { data, error, loading, refresh } = useApi<DashboardData>("/api/dashboard", { refreshMs: 10_000 });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      {denied && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("layout.accessDenied")}</AlertDescription>
        </Alert>
      )}

      <PageHeader title={t("dashboard.title")} description={t("dashboard.subtitle")} />

      {error && !data && <ErrorState className="mb-6" onRetry={refresh} />}

      <StatusBar data={data} loading={loading && !data} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ActionQueue />
        <KpiGrid data={data} loading={loading && !data} />
      </div>

      <div className="mt-6">
        <WeatherCard />
      </div>

      <div className="mt-6">
        <ForecastCard />
      </div>
    </div>
  );
}

/* ── Status bar: emergencies · unacknowledged critical · freshness ── */
function StatusBar({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading || !data) return <Skeleton className="h-14 w-full rounded-xl" />;

  const stale = now - new Date(data.generatedAt).getTime() > STALE_MS;
  const emergency = data.activeEmergencies > 0;
  const critical = data.criticalAlerts > 0;

  return (
    <Card className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3", emergency && "border-danger/40")} aria-live="polite">
      <StatusItem
        href="/command/emergencies"
        tone={emergency ? "danger" : "success"}
        pulse={emergency}
        label={emergency ? t("dashboard.emergenciesActive", { n: data.activeEmergencies }) : t("dashboard.noEmergencies")}
      />
      <StatusItem
        href="/admin/alerts"
        tone={critical ? "danger" : "success"}
        label={critical ? t("dashboard.criticalUnacked", { n: data.criticalAlerts }) : t("dashboard.noCritical")}
      />
      <span className={cn("ms-auto text-xs", stale ? "text-warning" : "text-muted-foreground")}>
        {stale ? t("common.stale") : t("common.updatedAgo", { time: f.relative(data.generatedAt) })}
      </span>
    </Card>
  );
}

function StatusItem({ href, tone, label, pulse }: { href: string; tone: "danger" | "success"; label: string; pulse?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md text-sm font-medium hover:underline">
      <span className={cn("h-2 w-2 rounded-full", TONE_DOT[tone], pulse && "animate-attention")} aria-hidden />
      <span className={tone === "danger" ? "text-danger" : "text-foreground/80"}>{label}</span>
    </Link>
  );
}

/* ── Action queue: unacknowledged alerts, most severe first ── */
function ActionQueue() {
  const { t } = useI18n();
  const f = useFormat();
  const { data: session } = useSession();
  const canAck = ROLE_GROUPS.SUPERVISE.includes(session?.user?.role as Role);
  const { data, error, loading, refresh } = useApi<{ alerts: AlertRow[]; openCount: number }>("/api/alerts?open=1&limit=20", { refreshMs: 10_000 });
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (data?.alerts ?? [])
        .filter((a) => !acked.has(a.id))
        .sort((a, b) => (SEVERITY_RANK[a.type] ?? 3) - (SEVERITY_RANK[b.type] ?? 3) || +new Date(b.createdAt) - +new Date(a.createdAt)),
    [data, acked],
  );

  async function acknowledge(id: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (res.ok) setAcked((s) => new Set(s).add(id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          {t("dashboard.actionQueue")}
        </h2>
        <Link href="/admin/alerts" className="text-xs text-primary hover:underline">
          {t("common.viewAll")}
        </Link>
      </div>

      {error && !data ? (
        <ErrorState className="m-4" onRetry={refresh} />
      ) : loading && !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={t("dashboard.queueEmptyTitle")} description={t("dashboard.queueEmptyBody")} />
      ) : (
        <ul className="divide-y">
          {rows.map((a) => {
            const tone = toneFor(a.type);
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 animate-slide-in">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("shrink-0 text-xs font-medium", TONE_TEXT[tone])}>{f.enum("alertType", a.type)}</span>
                    <span className="truncate text-sm">{a.title}</span>
                  </div>
                  <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                    {a.site && <span className="truncate">{a.site.name}</span>}
                    <span className="shrink-0">{f.relative(a.createdAt)}</span>
                  </div>
                </div>
                {canAck ? (
                  <Button size="sm" variant={tone === "danger" ? "default" : "outline"} disabled={busy === a.id} onClick={() => acknowledge(a.id)}>
                    {t("common.acknowledge")}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/admin/alerts">{t("common.open")}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── KPIs: each one links to the page that explains it ── */
function KpiGrid({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 self-start">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    );
  }
  const offline = Math.max(0, data.totalSensors - data.onlineSensors);
  const tiles: { label: string; value: number; href: string; icon: LucideIcon; alert?: "danger" | "warning" }[] = [
    { label: t("dashboard.kpiEmergencies"), value: data.activeEmergencies, href: "/command/emergencies", icon: Siren, alert: data.activeEmergencies ? "danger" : undefined },
    { label: t("dashboard.kpiCritical"), value: data.criticalAlerts, href: "/admin/alerts", icon: BellRing, alert: data.criticalAlerts ? "danger" : undefined },
    { label: t("dashboard.openIncidents"), value: data.openIncidents, href: "/safety/incidents", icon: AlertTriangle },
    { label: t("dashboard.kpiPermitsWaiting"), value: data.pendingPermits, href: "/operations/permits", icon: FileCheck2, alert: data.pendingPermits ? "warning" : undefined },
    { label: t("dashboard.kpiSensorsOffline"), value: offline, href: "/operations/sensors", icon: Gauge, alert: offline ? "warning" : undefined },
    { label: t("dashboard.kpiSites"), value: data.activeSites, href: "/operations/sites", icon: Building2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 self-start">
      {tiles.map((k) => (
        <Link key={k.label} href={k.href} className="group">
          <Card className="h-full p-4 transition-colors group-hover:bg-accent/40">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <k.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="truncate">{k.label}</span>
            </div>
            <div className={cn("num mt-2 text-[28px] font-semibold leading-none", k.alert === "danger" && "text-danger", k.alert === "warning" && "text-warning")}>
              {f.number(k.value)}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
