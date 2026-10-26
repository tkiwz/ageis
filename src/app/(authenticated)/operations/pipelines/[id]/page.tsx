"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Activity, AlertTriangle, ArrowLeft, Box, BrainCircuit, CheckCircle2, GitBranch, Loader2, MapPin, RotateCw,
} from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { useThemeColors } from "@/lib/ui/theme-colors";
import { TONE_DOT, TONE_EDGE, TONE_SOFT, TONE_TEXT, toneFor } from "@/lib/ui/tone";
import { ROLE_GROUPS } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ShareInsightButton } from "@/components/knowledge/share-insight-button";
import { cn } from "@/lib/utils";
import type { ApiResponse } from "@/types";
import type { Role } from "@/lib/constants";
import { SimulatedBadge } from "@/components/pipelines/simulated-badge";

interface PressurePoint {
  id: string;
  code: string;
  positionKm: number;
  latitude: number;
  longitude: number;
  expectedMin: number;
  expectedMax: number;
  currentPressure: number | null;
  currentFlow: number | null;
  currentTemp: number | null;
  status: string;
  lastReadingAt: string | null;
}

interface LeakAlert {
  id: string;
  alertNumber: string;
  severity: string;
  estimatedKmFromStart: number;
  confidence: number;
  pressureDrop: number;
  status: string;
  detectedAt: string;
}

interface Pipeline {
  id: string;
  code: string;
  isSimulated?: boolean;
  operator?: string | null;
  source?: string | null;
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
  installedAt: string;
  lastInspection: string | null;
  pressurePoints: PressurePoint[];
  leakAlerts: LeakAlert[];
}

interface ReadingSeries {
  pointId: string;
  code: string;
  positionKm: number;
  readings: {
    time: string;
    pressure: number;
    flowRate: number | null;
    temperature: number | null;
    status: string;
  }[];
}

interface AnalysisResult {
  analysis: {
    leakDetected: boolean;
    confidence?: number | null;
    severity?: string | null;
    estimatedKmFromStart?: number | null;
    estimatedLat?: number | null;
    estimatedLng?: number | null;
    pressureDrop?: number | null;
    summary?: string | null;
    summaryAr?: string | null;
    rootCause?: string | null;
    predictions?: string[] | null;
    immediateActions?: string[] | null;
  };
  leakAlert: { id: string; alertNumber: string } | null;
  linked: {
    incident: { id: string; number: string } | null;
    observation: { id: string; number: string } | null;
    emergency: { id: string; title: string } | null;
  } | null;
  meta: { durationMs: number };
}

type LoadState = "loading" | "ready" | "notFound" | "error";
type AnalysisError = "failed" | "forbidden" | "limited";

const ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

export default function PipelineDetailPage() {
  const { t, isAr } = useI18n();
  const id = useParams<{ id: string }>().id;
  const role = useSession().data?.user?.role as Role | undefined;
  const canAnalyze = !!role && ROLE_GROUPS.SUPERVISE.includes(role);

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [series, setSeries] = useState<ReadingSeries[] | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<AnalysisError | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`/api/pipelines/${id}`),
        fetch(`/api/pipelines/${id}/readings?hours=2`),
      ]);
      if (pRes.status === 404) {
        setState("notFound");
        return;
      }
      const pJson = (await pRes.json()) as ApiResponse<{ pipeline: Pipeline }>;
      if (!pJson.ok || !pJson.data) throw new Error("pipeline");
      const rJson = await readJson<{ series: ReadingSeries[] }>(rRes);
      setPipeline(pJson.data.pipeline);
      if (rJson?.ok && rJson.data) setSeries(rJson.data.series);
      setState("ready");
      setRefreshFailed(false);
      setUpdatedAt(Date.now());
    } catch {
      setRefreshFailed(true);
      setState((s) => (s === "ready" ? s : "error"));
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/pipelines/${id}/analyze`, { method: "POST" });
      const json = await readJson<AnalysisResult>(res);
      if (res.ok && json?.ok && json.data) {
        setAnalysis(json.data);
        await load();
      } else {
        setAnalysisError(res.status === 403 ? "forbidden" : res.status === 429 ? "limited" : "failed");
      }
    } catch {
      setAnalysisError("failed");
    } finally {
      setAnalyzing(false);
    }
  }, [id, load]);

  if (state === "loading") return <DetailSkeleton />;

  if (state === "notFound" || (state === "error" && !pipeline)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <BackLink />
        {state === "error" ? (
          <ErrorState onRetry={load} />
        ) : (
          <Card>
            <EmptyState
              icon={GitBranch}
              title={t("assets.pipeline.notFound.title")}
              description={t("assets.pipeline.notFound.body")}
              action={
                <Button asChild variant="outline">
                  <Link href="/operations/pipelines">{t("assets.pipeline.notFound.back")}</Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  if (!pipeline) return <DetailSkeleton />;

  const name = isAr ? pipeline.nameAr || pipeline.name : pipeline.name;
  const hasActiveLeak = pipeline.leakAlerts.some((l) => l.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <BackLink />

      <PageHeader
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="font-mono">{pipeline.code}</span>
            <StatusBadge value={pipeline.status} />
            {pipeline.isSimulated && <SimulatedBadge />}
            {pipeline.operator && <span className="text-xs text-muted-foreground">{pipeline.operator}</span>}
            {hasActiveLeak && (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE_SOFT.danger)}>
                <span className={cn("h-1.5 w-1.5 rounded-full animate-attention", TONE_DOT.danger)} aria-hidden />
                {t("assets.pipeline.activeLeak")}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/operations/pipelines/${pipeline.id}/3d`}>
                <Box strokeWidth={1.75} />
                {t("assets.pipeline.view3d")}
              </Link>
            </Button>
            <ShareInsightButton contextType="pipeline" contextId={pipeline.id} />
            {canAnalyze && (
              <Button onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <BrainCircuit strokeWidth={1.75} />}
                {analyzing ? t("assets.pipeline.analysis.running") : t("assets.pipeline.analysis.run")}
              </Button>
            )}
          </>
        }
      />

      {refreshFailed && <ErrorState className="mb-6" onRetry={load} />}
      {analysisError && (
        <ErrorState className="mb-6" message={t(`assets.pipeline.analysis.${analysisError}`)} onRetry={analysisError === "failed" ? runAnalysis : undefined} />
      )}

      <div className="space-y-6">
        {analyzing && <AnalysisSkeleton />}
        {analysis && <AnalysisPanel result={analysis} />}

        <SpecsCard pipeline={pipeline} />

        <PressureChartCard
          series={series}
          min={pipeline.pressureMin}
          max={pipeline.pressureMax}
          refreshing={refreshing}
          updatedAt={updatedAt}
          onRefresh={load}
        />

        <div className={cn("grid gap-6", pipeline.leakAlerts.length > 0 && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
          <PointsCard points={pipeline.pressurePoints} />
          {pipeline.leakAlerts.length > 0 && <LeakAlertsCard alerts={pipeline.leakAlerts} />}
        </div>
      </div>
    </div>
  );
}

/* ── Back link ── */
function BackLink() {
  const { t } = useI18n();
  return (
    <Button asChild variant="ghost" size="sm" className="-ms-2 mb-3 text-muted-foreground">
      <Link href="/operations/pipelines">
        <ArrowLeft className="rtl:rotate-180" strokeWidth={1.75} />
        {t("assets.pipeline.back")}
      </Link>
    </Button>
  );
}

/* ── First-load skeleton, shaped like the page ── */
function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8" aria-busy>
      <Skeleton className="mb-4 h-8 w-28" />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-[156px] rounded-xl" />
      <Skeleton className="mt-6 h-[420px] rounded-xl" />
      <Skeleton className="mt-6 h-[280px] rounded-xl" />
    </div>
  );
}

/* ── Specifications ── */
function SpecsCard({ pipeline: p }: { pipeline: Pipeline }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{t("assets.pipeline.specs.title")}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Spec label={t("assets.pipeline.specs.length")} value={f.number(p.length, ONE_DECIMAL)} unit={t("assets.units.km")} />
        <Spec label={t("assets.pipeline.specs.diameter")} value={f.number(p.diameter, ONE_DECIMAL)} unit={t("assets.units.inch")} />
        <Spec label={t("assets.pipeline.specs.material")} value={f.enum("material", p.material)} />
        <Spec label={t("assets.pipeline.specs.product")} value={f.enum("productType", p.productType)} />
        <Spec
          label={t("assets.pipeline.specs.pressureRange")}
          value={`${f.number(p.pressureMin, ONE_DECIMAL)}–${f.number(p.pressureMax, ONE_DECIMAL)}`}
          unit={t("assets.units.bar")}
          ltr
        />
        {p.flowRate !== null && (
          <Spec label={t("assets.pipeline.specs.flowRate")} value={f.number(p.flowRate, { maximumFractionDigits: 0 })} unit={t("assets.units.flow")} />
        )}
        <Spec label={t("assets.pipeline.specs.installed")} value={f.date(p.installedAt)} />
        <Spec
          label={t("assets.pipeline.specs.lastInspection")}
          value={p.lastInspection ? f.date(p.lastInspection) : t("assets.pipeline.specs.notRecorded")}
          muted={!p.lastInspection}
        />
      </dl>
    </Card>
  );
}

function Spec({ label, value, unit, ltr, muted }: { label: string; value: string; unit?: string; ltr?: boolean; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium", muted && "font-normal text-muted-foreground")}>
        <span className="num" dir={ltr ? "ltr" : undefined}>{value}</span>
        {unit && <span className="ms-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </dd>
    </div>
  );
}

/* ── AI analysis result ── */
function AnalysisSkeleton() {
  return (
    <Card className="space-y-3 p-5" aria-busy>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-4 w-2/3 max-w-md" />
    </Card>
  );
}

function AnalysisPanel({ result }: { result: AnalysisResult }) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const a = result.analysis;
  const summary = (isAr ? a.summaryAr || a.summary : a.summary) ?? "";
  const confidence = t("assets.pipeline.analysis.confidence", { n: f.number(Math.round((a.confidence ?? 0) * 100)) });
  const duration = t("assets.pipeline.analysis.duration", {
    n: t("assets.units.seconds", { n: f.number(result.meta.durationMs / 1000, ONE_DECIMAL) }),
  });

  if (!a.leakDetected) {
    return (
      <Card className={cn("animate-fade-in border-s-[3px] p-5", TONE_EDGE.success)}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("assets.pipeline.analysis.noLeakTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{summary || t("assets.pipeline.analysis.noLeakBody")}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {confidence} · {duration}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const severity = a.severity || "MEDIUM";
  const tone = toneFor(severity);
  const actions = a.immediateActions ?? [];
  const predictions = a.predictions ?? [];
  const linked = result.linked;
  const km = a.estimatedKmFromStart;

  return (
    <Card className={cn("animate-fade-in overflow-hidden border-s-[3px]", TONE_EDGE[tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", TONE_TEXT[tone])} strokeWidth={1.75} />
          <div className="min-w-0">
            <h2 className={cn("font-semibold", TONE_TEXT[tone])}>{t("assets.pipeline.analysis.leakTitle")}</h2>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {result.leakAlert && <span>{t("assets.pipeline.analysis.alertNumber", { number: result.leakAlert.alertNumber })}</span>}
              <span>{confidence}</span>
              <span>{duration}</span>
            </p>
          </div>
        </div>
        <StatusBadge value={severity} group="severity" />
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        <Section title={t("assets.pipeline.analysis.summary")}>
          <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
        </Section>

        <Section title={t("assets.pipeline.analysis.location")} icon={MapPin}>
          {km !== null && km !== undefined && (
            <p className="text-sm">
              {t("assets.pipeline.analysis.fromStart", { km: t("assets.units.kmAt", { n: f.number(km, ONE_DECIMAL) }) })}
            </p>
          )}
          {a.estimatedLat != null && a.estimatedLng != null && (
            <p dir="ltr" className="mt-1 text-start font-mono text-xs text-muted-foreground">
              {f.number(a.estimatedLat, { maximumFractionDigits: 4 })}, {f.number(a.estimatedLng, { maximumFractionDigits: 4 })}
            </p>
          )}
          {a.pressureDrop != null && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">{t("assets.pipeline.analysis.pressureDrop")}: </span>
              <span className={cn("num font-semibold", TONE_TEXT.danger)}>{f.number(a.pressureDrop, ONE_DECIMAL)}</span>
              <span className="ms-1 text-xs text-muted-foreground">{t("assets.units.bar")}</span>
            </p>
          )}
        </Section>

        {actions.length > 0 && (
          <Section title={t("assets.pipeline.analysis.actions")}>
            <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-foreground/90">
              {actions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </Section>
        )}

        {predictions.length > 0 && (
          <Section title={t("assets.pipeline.analysis.predictions")}>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-foreground/90">
              {predictions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Section>
        )}

        {a.rootCause && (
          <Section title={t("assets.pipeline.analysis.rootCause")} className="md:col-span-2">
            <p className="text-sm leading-relaxed text-foreground/90">{a.rootCause}</p>
          </Section>
        )}

        {linked && (linked.incident || linked.observation || linked.emergency) && (
          <Section title={t("assets.pipeline.analysis.linked")} className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {linked.incident && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/safety/incidents/${linked.incident.id}`}>
                    {t("assets.pipeline.analysis.linkedIncident", { number: linked.incident.number })}
                  </Link>
                </Button>
              )}
              {linked.observation && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/safety/observations">
                    {t("assets.pipeline.analysis.linkedObservation", { number: linked.observation.number })}
                  </Link>
                </Button>
              )}
              {linked.emergency && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/command/emergencies">{t("assets.pipeline.analysis.linkedEmergency")}</Link>
                </Button>
              )}
            </div>
          </Section>
        )}
      </div>

      <p className="flex items-center gap-1.5 border-t px-5 py-3 text-xs text-muted-foreground">
        <BrainCircuit className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        {t("assets.pipeline.analysis.aiNote")}
        {isAr && <span>{t("assets.pipeline.analysis.englishOnly")}</span>}
      </p>
    </Card>
  );
}

function Section({
  title, icon: Icon, className, children,
}: {
  title: string;
  icon?: typeof MapPin;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("bg-card p-5", className)}>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ── Pressure chart ── */
function PressureChartCard({
  series, min, max, refreshing, updatedAt, onRefresh,
}: {
  series: ReadingSeries[] | null;
  min: number;
  max: number;
  refreshing: boolean;
  updatedAt: number | null;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const c = useThemeColors();
  const data = useMemo(() => buildChartData(series ?? []), [series]);
  const lines = [c["chart-1"], c["chart-2"], c["chart-3"], c["chart-4"], c["chart-5"], c["chart-6"]];
  const axisTick = { fontSize: 11, fill: c["muted-foreground"] };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            {t("assets.pipeline.chart.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("assets.pipeline.chart.window")}
            {updatedAt && <> · {t("assets.pipeline.updatedAt", { time: f.time(updatedAt) })}</>}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="text-muted-foreground">
          <RotateCw className={cn(refreshing && "animate-spin")} strokeWidth={1.75} />
          {t("common.refresh")}
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState icon={Activity} title={t("assets.pipeline.chart.emptyTitle")} description={t("assets.pipeline.chart.emptyBody")} />
      ) : (
        <div dir="ltr" className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(v: string) => f.time(v)}
                tick={axisTick}
                stroke={c.border}
                minTickGap={32}
              />
              <YAxis
                domain={[Math.max(0, min - 10), max + 5]}
                tickFormatter={(v: number) => f.number(v)}
                tick={axisTick}
                stroke={c.border}
                width={60}
                label={{ value: t("assets.pipeline.chart.axis"), angle: -90, position: "insideLeft", fill: c["muted-foreground"], fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(v) => f.dateTime(String(v))}
                formatter={(value, name) => [
                  typeof value === "number" ? `${f.number(value, ONE_DECIMAL)} ${t("assets.units.bar")}` : String(value),
                  name,
                ]}
                contentStyle={{
                  backgroundColor: c.card,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  fontSize: 12,
                  color: c.foreground,
                }}
                labelStyle={{ color: c["muted-foreground"] }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                y={min}
                stroke={c.danger}
                strokeDasharray="4 4"
                label={{ value: t("assets.pipeline.chart.minSafe"), fontSize: 11, position: "insideBottomLeft", fill: c.danger }}
              />
              <ReferenceLine
                y={max}
                stroke={c.danger}
                strokeDasharray="4 4"
                label={{ value: t("assets.pipeline.chart.maxSafe"), fontSize: 11, position: "insideTopLeft", fill: c.danger }}
              />
              {(series ?? []).map((s, i) => (
                <Line
                  key={s.pointId}
                  type="monotone"
                  dataKey={s.code}
                  name={s.code}
                  stroke={lines[i % lines.length]}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ── Pressure points ── */
function PointsCard({ points }: { points: PressurePoint[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const dash = "—";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          {t("assets.pipeline.points.title")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("assets.pipeline.points.count", { n: f.number(points.length) })}</span>
      </div>

      {points.length === 0 ? (
        <EmptyState icon={MapPin} title={t("assets.pipeline.points.emptyTitle")} description={t("assets.pipeline.points.emptyBody")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-start font-medium">{t("assets.pipeline.points.code")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("assets.pipeline.points.position")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("assets.pipeline.points.pressure")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("assets.pipeline.points.flow")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("assets.pipeline.points.temperature")}</th>
                <th className="px-5 py-2.5 text-start font-medium">{t("assets.pipeline.points.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {points.map((p) => {
                const tone = toneFor(p.status);
                return (
                  <tr key={p.id} className="transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-5 py-3">
                      <span dir="ltr" className="font-mono text-xs">{p.code}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-foreground/80">
                      {t("assets.units.kmAt", { n: f.number(p.positionKm, ONE_DECIMAL) })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {p.currentPressure !== null ? (
                        <>
                          <span className={cn("num font-semibold", TONE_TEXT[tone])}>{f.number(p.currentPressure, ONE_DECIMAL)}</span>
                          <span className="ms-1 text-xs text-muted-foreground">{t("assets.units.bar")}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{dash}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-foreground/80">
                      {p.currentFlow !== null ? (
                        <>
                          <span className="num">{f.number(p.currentFlow, { maximumFractionDigits: 0 })}</span>
                          <span className="ms-1 text-xs text-muted-foreground">{t("assets.units.flow")}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{dash}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-foreground/80">
                      {p.currentTemp !== null ? (
                        <>
                          <span className="num">{f.number(p.currentTemp, ONE_DECIMAL)}</span>
                          <span className="ms-1 text-xs text-muted-foreground">{t("assets.units.celsius")}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{dash}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <StatusBadge value={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── Recent leak alerts on this line ── */
function LeakAlertsCard({ alerts }: { alerts: LeakAlert[] }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <Card className="self-start overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold">{t("assets.pipeline.leaks.title")}</h2>
      </div>
      <ul className="divide-y">
        {alerts.map((l) => {
          const tone = toneFor(l.severity);
          return (
            <li key={l.id} className="flex items-start gap-3 px-5 py-3">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span dir="ltr" className="font-mono text-xs">{l.alertNumber}</span>
                  <span className={cn("text-xs font-medium", TONE_TEXT[tone])}>{f.enum("severity", l.severity)}</span>
                  <StatusBadge value={l.status} variant="dot" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("assets.pipeline.leaks.at", { km: t("assets.units.kmAt", { n: f.number(l.estimatedKmFromStart, ONE_DECIMAL) }) })}
                  {" · "}
                  {t("assets.pipeline.leaks.detected", { time: f.relative(l.detectedAt) })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── Helpers ── */
/** Parsed API envelope, or null when the body isn't JSON. */
async function readJson<T>(res: Response) {
  try {
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return null;
  }
}

type ChartRow = { time: string } & Record<string, number | string>;

function buildChartData(series: ReadingSeries[]): ChartRow[] {
  const byTime = new Map<string, ChartRow>();
  for (const s of series) {
    for (const r of s.readings) {
      const key = new Date(r.time).toISOString();
      const row = byTime.get(key) ?? { time: key };
      row[s.code] = r.pressure;
      byTime.set(key, row);
    }
  }
  return Array.from(byTime.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}
