"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain, CheckCircle2, ChevronDown, ChevronUp, Eye, FileSpreadsheet, Loader2, MapPin, Plus, RefreshCw, Upload, X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { TONE_SOFT, type Tone } from "@/lib/ui/tone";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/ui/empty-state";

interface Observation {
  id: string;
  recordNumber: string;
  type: string;
  status: string;
  location: string;
  findings: string;
  unsafeDetail: string | null;
  contractor: string | null;
  observedAt: string;
  site: { code: string; name: string } | null;
  reportedBy: { name: string; role: string };
}

interface Detected {
  sheet: string | null;
  headerRow: number;
  totalRows: number;
  unmatchedSites: number;
  fallbackSite: string;
  columns: Record<string, { header: string; via: "header" | "values" | "ai" }>;
}
interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  analysis: string;
  detected: Detected;
}
interface Site { id: string; code: string; name: string; nameAr?: string | null }

type Filter = "ALL" | "OPEN" | "RESOLVED";

const TYPE_TONE: Record<string, Tone> = { UNSAFE_CONDITION: "warning", UNSAFE_ACT: "warning", NEAR_MISS: "danger", POSITIVE: "success" };
const STATUS_TONE: Record<string, Tone> = { OPEN: "warning", RESOLVED: "success", DRAFT: "neutral" };
const FIELD_ORDER = ["findings", "type", "observedAt", "location", "site", "unsafeDetail", "contractor", "status"];

export default function ObservationsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    const j = await fetch(`/api/observations?${params}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setItems(j.data.observations ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={t("safety.observations.title")}
        description={t("safety.observations.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} aria-label={t("safety.observations.refresh")}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button variant={showImport ? "outline" : "default"} onClick={() => setShowImport((v) => !v)}>
              {showImport ? <><X className="h-4 w-4" />{t("safety.observations.close")}</> : <><Upload className="h-4 w-4" />{t("safety.observations.import")}</>}
            </Button>
          </>
        }
      />

      {showImport && <ImportPanel onDone={() => { setShowImport(false); load(); }} />}

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((k) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="rounded-full" onClick={() => setFilter(k)}>
            {t(`safety.observations.filter.${k}`)}
          </Button>
        ))}
        <span className="ms-auto text-xs text-muted-foreground">{t("safety.observations.count", { n: items.length })}</span>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("safety.observations.loading")}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Eye}
            title={t("safety.observations.none")}
            description={t("safety.observations.noneDesc")}
            action={!showImport && <Button onClick={() => setShowImport(true)}><Upload className="h-4 w-4" />{t("safety.observations.import")}</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((o) => <ObservationCard key={o.id} obs={o} />)}
        </div>
      )}
    </div>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const { t, isAr } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((j) => {
      const list: Site[] = j?.ok ? (Array.isArray(j.data) ? j.data : (j.data.sites ?? [])) : [];
      setSites(list);
      if (list[0]) setSiteId(list[0].id);
    }).catch(() => {});
  }, []);

  const errText = (code: string | undefined, fallback?: string) =>
    (code && tryT(code)) || fallback || t("safety.observations.imp.failed");
  /** Known server codes are translated; anything else is shown as sent. */
  function tryT(code: string): string | null {
    const key = `safety.observationsImportErrors.${code}` as MessageKey;
    const s = t(key);
    return s === key ? null : s;
  }

  async function handleImport() {
    if (!file) return;
    setUploading(true); setResult(null); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    if (siteId) fd.append("siteId", siteId);
    const j = await fetch("/api/observations/import", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setResult(j.data);
    else setError(errText(j?.error?.code, j?.error?.message));
    setUploading(false);
  }

  return (
    <Card className="space-y-4 border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">{t("safety.observations.imp.title")}</h2>
        <span className="text-[11px] text-muted-foreground">{t("safety.observations.imp.formats")}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("safety.observations.imp.hint")}</p>

      {!result ? (
        <>
          <div
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/50 hover:bg-muted/20",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-1">
                <FileSpreadsheet className="mx-auto h-8 w-8 text-primary" />
                <div className="text-sm font-semibold" dir="ltr">{file.name}</div>
                <div className="text-xs text-muted-foreground">{t("safety.observations.imp.change", { size: (file.size / 1024).toFixed(1) })}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <div className="text-sm text-muted-foreground">{t("safety.observations.imp.drop")}</div>
              </div>
            )}
          </div>

          {sites.length > 1 && (
            <div className="max-w-sm space-y-1.5">
              <Label>{t("safety.observations.imp.defaultSite")}</Label>
              <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {isAr && s.nameAr ? s.nameAr : s.name}</option>)}
              </NativeSelect>
            </div>
          )}

          {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            {file && <Button variant="outline" size="sm" onClick={() => setFile(null)}>{t("safety.observations.imp.clear")}</Button>}
            <Button onClick={handleImport} disabled={!file || uploading}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("safety.observations.imp.running")}</> : <><Brain className="h-3.5 w-3.5" />{t("safety.observations.imp.run")}</>}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<CheckCircle2 className="h-3 w-3" />} label={t("safety.observations.imp.imported")} value={result.imported} tone="success" />
            <Stat icon={<AlertTriangle className="h-3 w-3" />} label={t("safety.observations.imp.skipped")} value={result.skipped} tone={result.skipped ? "warning" : "neutral"} />
          </div>

          <div className="rounded-xl border border-border/50 bg-background/60 p-4">
            <div className="mb-1 text-sm font-semibold">{t("safety.observations.imp.understood")}</div>
            <div className="mb-3 text-xs text-muted-foreground">
              {result.detected.sheet
                ? t("safety.observations.imp.sheet", { sheet: result.detected.sheet, row: result.detected.headerRow, n: result.detected.totalRows })
                : t("safety.observations.imp.noSheet", { row: result.detected.headerRow, n: result.detected.totalRows })}
            </div>
            <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              {FIELD_ORDER.filter((k) => result.detected.columns[k]).map((k) => {
                const c = result.detected.columns[k];
                return (
                  <div key={k} className="flex items-center gap-2">
                    <dt className="w-28 shrink-0 text-muted-foreground">{t(`safety.observations.imp.fields.${k}` as MessageKey)}</dt>
                    <dd className="min-w-0 truncate font-medium" dir="auto">{c.header}</dd>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", c.via === "ai" ? TONE_SOFT.info : TONE_SOFT.neutral)}>
                      {t(`safety.observations.imp.via.${c.via}`)}
                    </span>
                  </div>
                );
              })}
            </dl>
            {result.detected.unmatchedSites > 0 && (
              <p className="mt-3 text-xs text-warning">
                {t("safety.observations.imp.unmatched", { n: result.detected.unmatchedSites, site: result.detected.fallbackSite })}
              </p>
            )}
          </div>

          {result.imported > 0 && (
            <div className="rounded-xl border border-primary/20 bg-background/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{t("safety.observations.imp.analysis")}</span>
                {result.analysis && <span className={cn("rounded-full px-2 py-0.5 text-[10px]", TONE_SOFT.info)}>{t("safety.observations.imp.aiBadge")}</span>}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" dir="auto">
                {result.analysis || <span className="text-muted-foreground">{t("safety.observations.imp.noAnalysis")}</span>}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-border/50">
              <button
                onClick={() => setShowErrors((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>{t("safety.observations.imp.rowsSkipped", { n: result.skipped })}</span>
                {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showErrors && (
                <div className="space-y-1 border-t border-border/40 px-3 pb-3 pt-2">
                  {result.errors.map((e) => (
                    <div key={e.row} className="text-[11px] text-muted-foreground">
                      {t("safety.observations.imp.row", { row: e.row, reason: tryT(e.reason) ?? e.reason })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setResult(null); setFile(null); }}>
              <Plus className="h-3 w-3" /> {t("safety.observations.imp.another")}
            </Button>
            <Button size="sm" onClick={onDone}>{t("safety.observations.imp.view")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: Tone }) {
  return (
    <div className={cn("rounded-xl p-3 text-center", TONE_SOFT[tone])}>
      <div className="flex items-center justify-center gap-1 text-[11px]">{icon} {label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ObservationCard({ obs }: { obs: Observation }) {
  const { t } = useI18n();
  const f = useFormat();
  const [expanded, setExpanded] = useState(false);
  const typeTone = TYPE_TONE[obs.type] ?? "neutral";
  const typeKey = `safety.observations.type.${obs.type}` as MessageKey;
  const statusKey = `safety.observations.status.${obs.status}` as MessageKey;
  const label = (key: MessageKey, raw: string) => { const s = t(key); return s === key ? raw : s; };

  return (
    <Card className="space-y-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{obs.recordNumber}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", TONE_SOFT[typeTone])}>{label(typeKey, obs.type)}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TONE_SOFT[STATUS_TONE[obs.status] ?? "neutral"])}>{label(statusKey, obs.status)}</span>
        <span className="ms-auto text-[10px] text-muted-foreground">{f.date(obs.observedAt, { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>

      <div className={cn("text-sm leading-snug", !expanded && "line-clamp-2")} dir="auto">{obs.findings}</div>
      {obs.findings.length > 120 && (
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-0.5 text-[11px] text-primary/80 hover:text-primary">
          {expanded ? <><ChevronUp className="h-3 w-3" />{t("safety.observations.less")}</> : <><ChevronDown className="h-3 w-3" />{t("safety.observations.more")}</>}
        </button>
      )}

      {obs.unsafeDetail && <div className="border-s-2 border-warning/40 ps-2 text-xs text-muted-foreground" dir="auto">{obs.unsafeDetail}</div>}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {obs.location}</span>
        {obs.site && <span>· {obs.site.code}</span>}
        <span>· {obs.reportedBy.name}</span>
        {obs.contractor && <span>· {obs.contractor}</span>}
      </div>
    </Card>
  );
}
