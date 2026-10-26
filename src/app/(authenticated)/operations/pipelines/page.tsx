"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ChevronRight, Droplet, Droplets, Flame, Fuel, Gauge, GitBranch, Search, X,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TONE_DOT, TONE_SOFT } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

interface Pipeline {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  length: number;
  diameter: number;
  material: string;
  status: string;
  productType: string;
  pressureMin: number;
  pressureMax: number;
  flowRate: number | null;
  _count: {
    pressurePoints: number;
    leakAlerts: number;
  };
}

interface KPIs {
  total: number;
  operational: number;
  totalLength: number;
  activeLeaks: number;
  criticalPoints: number;
  warningPoints: number;
}

interface PipelineResponse {
  pipelines: Pipeline[];
  kpis: KPIs;
}

const STATUSES = ["OPERATIONAL", "MAINTENANCE", "INSPECTION", "SHUTDOWN"] as const;
const PRODUCTS = ["NATURAL_GAS", "CRUDE_OIL", "LPG", "CONDENSATE"] as const;

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  NATURAL_GAS: Flame,
  CRUDE_OIL: Droplet,
  LPG: Fuel,
  CONDENSATE: Droplets,
};

export default function PipelinesPage() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data, error, loading, refresh } = useApi<PipelineResponse>("/api/pipelines");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [product, setProduct] = useState("ALL");
  const [leaksOnly, setLeaksOnly] = useState(false);

  const pipelines = useMemo(() => data?.pipelines ?? [], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pipelines.filter((p) => {
      if (status !== "ALL" && p.status !== status) return false;
      if (product !== "ALL" && p.productType !== product) return false;
      if (leaksOnly && p._count.leakAlerts === 0) return false;
      if (!q) return true;
      return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.nameAr ?? "").toLowerCase().includes(q);
    });
  }, [pipelines, search, status, product, leaksOnly]);

  const hasFilters = search.trim() !== "" || status !== "ALL" || product !== "ALL" || leaksOnly;
  const clearFilters = () => {
    setSearch("");
    setStatus("ALL");
    setProduct("ALL");
    setLeaksOnly(false);
  };
  const firstLoad = loading && !data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <PageHeader title={t("assets.pipelines.title")} description={t("assets.pipelines.description")} />

      {error && !data ? (
        <ErrorState onRetry={refresh} />
      ) : (
        <>
          <KpiRow
            kpis={data?.kpis ?? null}
            loading={firstLoad}
            leaksOnly={leaksOnly}
            onToggleLeaks={() => setLeaksOnly((v) => !v)}
          />

          <Card className="mt-6 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("assets.pipelines.filters.search")}
                  aria-label={t("assets.pipelines.filters.search")}
                  className="ps-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  aria-label={t("assets.pipelines.filters.status")}
                  className="min-w-[11rem]"
                >
                  <option value="ALL">{t("assets.pipelines.filters.allStatuses")}</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {f.enum("status", s)}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  aria-label={t("assets.pipelines.filters.product")}
                  className="min-w-[11rem]"
                >
                  <option value="ALL">{t("assets.pipelines.filters.allProducts")}</option>
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>
                      {f.enum("productType", p)}
                    </option>
                  ))}
                </NativeSelect>
                <Button variant={leaksOnly ? "secondary" : "outline"} aria-pressed={leaksOnly} onClick={() => setLeaksOnly((v) => !v)}>
                  <AlertTriangle strokeWidth={1.75} />
                  {t("assets.pipelines.filters.leaksOnly")}
                </Button>
                {hasFilters && (
                  <Button variant="ghost" onClick={clearFilters}>
                    <X strokeWidth={1.75} />
                    {t("assets.pipelines.filters.clear")}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="mt-6">
            {firstLoad ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[188px] rounded-xl" />
                ))}
              </div>
            ) : pipelines.length === 0 ? (
              <Card>
                <EmptyState icon={GitBranch} title={t("assets.pipelines.empty.title")} description={t("assets.pipelines.empty.body")} />
              </Card>
            ) : filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Search}
                  title={t("assets.pipelines.noMatch.title")}
                  description={t("assets.pipelines.noMatch.body")}
                  action={
                    <Button variant="outline" onClick={clearFilters}>
                      {t("assets.pipelines.filters.clear")}
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filtered.map((p) => (
                  <PipelineCard key={p.id} pipeline={p} name={isAr ? p.nameAr || p.name : p.name} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── KPIs ── */
function KpiRow({
  kpis, loading, leaksOnly, onToggleLeaks,
}: {
  kpis: KPIs | null;
  loading: boolean;
  leaksOnly: boolean;
  onToggleLeaks: () => void;
}) {
  const { t } = useI18n();
  const f = useFormat();

  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const pressureAlerts = kpis.criticalPoints + kpis.warningPoints;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile
        icon={GitBranch}
        label={t("assets.pipelines.kpi.total")}
        value={f.number(kpis.total)}
        hint={t("assets.pipelines.kpi.totalHint", { length: f.number(kpis.totalLength, { maximumFractionDigits: 0 }) })}
      />
      <KpiTile
        icon={Activity}
        label={t("assets.pipelines.kpi.operational")}
        value={f.number(kpis.operational)}
        hint={t("assets.pipelines.kpi.operationalHint", { total: f.number(kpis.total) })}
      />
      <KpiTile
        icon={AlertTriangle}
        label={t("assets.pipelines.kpi.activeLeaks")}
        value={f.number(kpis.activeLeaks)}
        hint={
          kpis.activeLeaks === 0
            ? t("assets.pipelines.kpi.activeLeaksNone")
            : leaksOnly
              ? t("assets.pipelines.kpi.activeLeaksFiltered")
              : t("assets.pipelines.kpi.activeLeaksHint")
        }
        tone={kpis.activeLeaks > 0 ? "danger" : undefined}
        pressed={kpis.activeLeaks > 0 ? leaksOnly : undefined}
        onClick={kpis.activeLeaks > 0 ? onToggleLeaks : undefined}
      />
      <KpiTile
        icon={Gauge}
        label={t("assets.pipelines.kpi.pressureAlerts")}
        value={f.number(pressureAlerts)}
        hint={t("assets.pipelines.kpi.pressureAlertsHint", {
          critical: f.number(kpis.criticalPoints),
          warning: f.number(kpis.warningPoints),
        })}
        tone={kpis.criticalPoints > 0 ? "danger" : kpis.warningPoints > 0 ? "warning" : undefined}
      />
    </div>
  );
}

function KpiTile({
  icon: Icon, label, value, hint, tone, pressed, onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "danger" | "warning";
  pressed?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <Card
      className={cn(
        "h-full p-4 text-start transition-colors",
        onClick && "group-hover:bg-accent/40",
        pressed && "border-danger/40 bg-danger/5",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("num mt-2 text-[28px] font-semibold leading-none", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>
        {value}
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="group block w-full rounded-xl">
      {body}
    </button>
  );
}

/* ── Pipeline card ── */
function PipelineCard({ pipeline: p, name }: { pipeline: Pipeline; name: string }) {
  const { t } = useI18n();
  const f = useFormat();
  const ProductIcon = PRODUCT_ICONS[p.productType] ?? Droplet;
  const leaks = p._count.leakAlerts;
  const one = { maximumFractionDigits: 1 };

  return (
    <Link href={`/operations/pipelines/${p.id}`} className="group block rounded-xl">
      <Card className={cn("h-full p-5 transition-colors group-hover:bg-accent/40", leaks > 0 && "border-s-[3px] border-s-danger")}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ProductIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {p.code}
              </span>
              <StatusBadge value={p.status} />
              {leaks > 0 && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE_SOFT.danger)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT.danger)} aria-hidden />
                  {t("assets.pipelines.card.activeLeaks", { n: f.number(leaks) })}
                </span>
              )}
            </div>
            <h3 className="mt-2 truncate font-semibold">{name}</h3>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" strokeWidth={1.75} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          <Stat label={t("assets.pipelines.card.length")} value={f.number(p.length, one)} unit={t("assets.units.km")} />
          <Stat label={t("assets.pipelines.card.diameter")} value={f.number(p.diameter, one)} unit={t("assets.units.inch")} />
          <Stat
            label={t("assets.pipelines.card.pressure")}
            value={`${f.number(p.pressureMin, one)}–${f.number(p.pressureMax, one)}`}
            unit={t("assets.units.bar")}
          />
          <Stat label={t("assets.pipelines.card.sensors")} value={f.number(p._count.pressurePoints)} />
        </dl>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("assets.pipelines.card.product")}: <span className="font-medium text-foreground">{f.enum("productType", p.productType)}</span>
          </span>
          <span>
            {t("assets.pipelines.card.material")}: <span className="text-foreground/80">{f.enum("material", p.material)}</span>
          </span>
        </div>
      </Card>
    </Link>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">
        <span dir="ltr" className="num">{value}</span>
        {unit && <span className="ms-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </dd>
    </div>
  );
}
