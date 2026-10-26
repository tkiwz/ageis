"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert, Plus, X, Loader2, Brain, CheckCircle2, Clock, RefreshCw,
  ChevronDown, ChevronUp, Link2, ArrowRight, MapPin, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { TONE_EDGE, toneFor } from "@/lib/ui/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PermitRef {
  id: string; permitNumber: string; title: string; status: string;
}

interface RiskAssessment {
  id:                string;
  title:             string;
  type:              string;
  hazardDescription: string;
  riskBefore:        string;
  controlsSuggested: string;
  riskAfter:         string;
  aiSuggested:       boolean;
  status:            string;
  createdAt:         string;
  permitId:          string | null;
  permit:            PermitRef | null;
  site:        { code: string; name: string };
  conductedBy: { name: string; role: string };
}

interface Stats {
  total: number; draft: number; approved: number; expired: number; withAI: number;
}

type Filter = "ALL" | "DRAFT" | "APPROVED" | "EXPIRED";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TYPES = ["CHEMICAL", "PHYSICAL", "ELECTRICAL", "FIRE", "ERGONOMIC", "BIOLOGICAL", "PROCESS_SAFETY", "MECHANICAL", "ENVIRONMENTAL", "GENERAL"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const OPEN_PERMIT = ["DRAFT", "PENDING", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE"];
const FILTERS: Filter[] = ["ALL", "DRAFT", "APPROVED", "EXPIRED"];

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function RiskAssessmentPage() {
  const { t } = useI18n();
  const f = useFormat();
  const [items,      setItems]      = useState<RiskAssessment[]>([]);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [sites,      setSites]      = useState<{ id: string; code: string; name: string }[]>([]);
  const [permits,    setPermits]    = useState<PermitRef[]>([]);

  // Form state
  const [fTitle,    setFTitle]    = useState("");
  const [fType,     setFType]     = useState("CHEMICAL");
  const [fHazard,   setFHazard]   = useState("");
  const [fBefore,   setFBefore]   = useState("HIGH");
  const [fControls, setFControls] = useState("");
  const [fAfter,    setFAfter]    = useState("LOW");
  const [fSite,     setFSite]     = useState("");
  const [fPermit,   setFPermit]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [aiUsed,    setAiUsed]    = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/risk-assessments?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.assessments ?? []);
    setLoading(false);
  }, [filter]);

  const loadStats = useCallback(async () => {
    const r = await fetch("/api/risk-assessments?stats=1");
    const j = await r.json();
    if (j.ok) setStats(j.data);
  }, []);

  const loadSites = useCallback(async () => {
    const r = await fetch("/api/sites");
    const j = await r.json();
    if (j.ok) setSites(Array.isArray(j.data) ? j.data : (j.data.sites ?? []));
  }, []);

  const loadPermits = useCallback(async () => {
    // Open permits only (pending approval or active) — closed ones cannot be linked
    const r = await fetch("/api/permits?limit=100");
    const j = await r.json();
    if (j.ok) setPermits((j.data.permits ?? []).filter((p: PermitRef) => OPEN_PERMIT.includes(p.status)));
  }, []);

  useEffect(() => { loadItems(); loadStats(); }, [loadItems, loadStats]);
  useEffect(() => { if (showNew) { loadSites(); loadPermits(); } }, [showNew, loadSites, loadPermits]);

  async function suggestControls() {
    if (!fHazard) return;
    setAiLoading(true);
    setFormError(null);
    const r = await fetch("/api/risk-assessments/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hazardDescription: fHazard, type: fType, riskBefore: fBefore }),
    });
    const j = await r.json();
    if (j.ok) { setFControls(j.data.controlsSuggested); setFAfter(j.data.riskAfter); setAiUsed(true); }
    else setFormError(j.error?.message ?? t("safety.risk.form.aiFailed"));
    setAiLoading(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    const r = await fetch("/api/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fTitle, type: fType, hazardDescription: fHazard,
        riskBefore: fBefore, controlsSuggested: fControls, riskAfter: fAfter,
        siteId: fSite || sites[0]?.id,
        aiSuggested: aiUsed && !!fControls,
        permitId: fPermit || null,
      }),
    });
    const j = await r.json();
    if (j.ok) { setShowNew(false); resetForm(); await Promise.all([loadItems(), loadStats()]); }
    else setFormError(j.error?.message ?? t("safety.risk.form.saveFailed"));
    setCreating(false);
  }

  function resetForm() {
    setFTitle(""); setFType("CHEMICAL"); setFHazard(""); setFBefore("HIGH");
    setFControls(""); setFAfter("LOW"); setFSite(""); setFPermit("");
    setAiUsed(false); setFormError(null);
  }

  async function updateStatus(id: string, status: string) {
    const r = await fetch("/api/risk-assessments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) window.alert(j?.error?.message ?? t("safety.risk.card.updateFailed"));
    await Promise.all([loadItems(), loadStats()]);
  }

  const typeLabel = (v: string) => t(`safety.risk.types.${v}` as MessageKey);

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <ShieldAlert className="h-6 w-6 text-primary" /> {t("safety.risk.title")}
          </span>
        }
        description={t("safety.risk.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t("safety.risk.refresh")} onClick={() => { loadItems(); loadStats(); }}>
              <RefreshCw />
            </Button>
            <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
              {showNew ? <><X /> {t("safety.risk.cancel")}</> : <><Plus /> {t("safety.risk.new")}</>}
            </Button>
          </>
        }
      />

      {/* ── KPI strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label={t("safety.risk.kpi.total")}    value={stats?.total    ?? 0} />
        <Kpi label={t("safety.risk.kpi.draft")}    value={stats?.draft    ?? 0} />
        <Kpi label={t("safety.risk.kpi.approved")} value={stats?.approved ?? 0} tone="text-success" />
        <Kpi label={t("safety.risk.kpi.expired")}  value={stats?.expired  ?? 0} tone="text-warning" />
        <Kpi label={t("safety.risk.kpi.ai")}       value={stats?.withAI   ?? 0} tone="text-primary" />
      </div>

      {/* ══ New assessment form ══════════════════════════ */}
      {showNew && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-primary" /> {t("safety.risk.form.heading")}
            </h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ra-title">{t("safety.risk.form.title")}</Label>
                  <Input id="ra-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} required minLength={3}
                    placeholder={t("safety.risk.form.titlePh")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ra-type">{t("safety.risk.form.type")}</Label>
                  <NativeSelect id="ra-type" value={fType} onChange={(e) => setFType(e.target.value)}>
                    {TYPES.map((v) => <option key={v} value={v}>{typeLabel(v)}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ra-before">{t("safety.risk.form.riskBefore")}</Label>
                  <NativeSelect id="ra-before" value={fBefore} onChange={(e) => setFBefore(e.target.value)}>
                    {RISK_LEVELS.map((l) => <option key={l} value={l}>{f.enum("severity", l)}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="ra-hazard">{t("safety.risk.form.hazard")}</Label>
                    <Button type="button" size="sm" variant="outline" onClick={suggestControls} disabled={aiLoading || fHazard.trim().length < 10}>
                      {aiLoading ? <Loader2 className="animate-spin" /> : <Brain />}
                      {aiLoading ? t("safety.risk.form.analysing") : t("safety.risk.form.suggest")}
                    </Button>
                  </div>
                  <Textarea id="ra-hazard" value={fHazard} onChange={(e) => setFHazard(e.target.value)} required minLength={10} rows={3}
                    placeholder={t("safety.risk.form.hazardPh")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ra-controls" className="flex flex-wrap items-center gap-2">
                    {t("safety.risk.form.controls")}
                    {aiUsed && fControls && <span className="text-xs font-normal text-primary">{t("safety.risk.form.aiFilled")}</span>}
                  </Label>
                  <Textarea id="ra-controls" value={fControls} onChange={(e) => setFControls(e.target.value)} rows={5}
                    placeholder={t("safety.risk.form.controlsPh")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ra-after">{t("safety.risk.form.riskAfter")}</Label>
                  <NativeSelect id="ra-after" value={fAfter} onChange={(e) => setFAfter(e.target.value)}>
                    {RISK_LEVELS.map((l) => <option key={l} value={l}>{f.enum("severity", l)}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ra-site">{t("safety.risk.form.site")}</Label>
                  <NativeSelect id="ra-site" value={fSite} onChange={(e) => setFSite(e.target.value)}>
                    <option value="">{t("safety.risk.form.sitePh")}</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ra-permit" className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> {t("safety.risk.form.permit")}
                    <span className="font-normal text-muted-foreground">— {t("safety.risk.form.optional")}</span>
                  </Label>
                  <NativeSelect id="ra-permit" value={fPermit} onChange={(e) => setFPermit(e.target.value)}>
                    <option value="">{t("safety.risk.form.noPermit")}</option>
                    {permits.map((p) => (
                      <option key={p.id} value={p.id}>{p.permitNumber} — {p.title.slice(0, 50)}</option>
                    ))}
                  </NativeSelect>
                  {permits.length === 0 && <p className="text-xs text-muted-foreground">{t("safety.risk.form.noOpenPermits")}</p>}
                </div>
              </div>
              {formError && (
                <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>
                  {t("safety.risk.cancel")}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
                  {t("safety.risk.form.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Filter ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              filter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}>
            {t(`safety.risk.filter.${v}` as MessageKey)}
          </button>
        ))}
      </div>

      {/* ── List ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={t("safety.risk.empty")} description={t("safety.risk.emptyHint")} />
      ) : (
        <div className="space-y-3">
          {items.map((ra) => <RiskCard key={ra.id} ra={ra} typeLabel={typeLabel} onStatusChange={updateStatus} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Risk card
// ─────────────────────────────────────────────────────────────

function RiskCard({
  ra, typeLabel, onStatusChange,
}: {
  ra: RiskAssessment;
  typeLabel: (v: string) => string;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);

  async function changeStatus(status: string) {
    setUpdating(true);
    await onStatusChange(ra.id, status);
    setUpdating(false);
  }

  const riskReduced = RISK_LEVELS.indexOf(ra.riskAfter) < RISK_LEVELS.indexOf(ra.riskBefore);

  return (
    <Card className={cn("border-s-4", TONE_EDGE[toneFor(ra.riskBefore)])}>
      <CardContent className="space-y-2.5 p-4">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{typeLabel(ra.type)}</span>
          <StatusBadge value={ra.status} />
          {ra.aiSuggested && (
            <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              <Brain className="h-3 w-3" /> {t("safety.risk.card.ai")}
            </span>
          )}
          {ra.permit && (
            <Link href={`/operations/permits/${ra.permit.id}`}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/15">
              <Link2 className="h-3 w-3" /> {ra.permit.permitNumber}
            </Link>
          )}
          <span className="ms-auto text-xs text-muted-foreground">{f.date(ra.createdAt)}</span>
        </div>

        {/* Title + hazard */}
        <div className="text-sm font-semibold leading-snug">{ra.title}</div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{ra.hazardDescription}</p>

        {/* Risk before → controls → after */}
        <div className="flex items-center gap-2">
          <StatusBadge value={ra.riskBefore} group="severity" />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
          <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
            {ra.controlsSuggested || t("safety.risk.card.noControls")}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
          <StatusBadge value={ra.riskAfter} group="severity" />
          {riskReduced && <span className="text-xs text-success">{t("safety.risk.card.reduced")}</span>}
        </div>

        {/* Expanded details */}
        {expanded && ra.controlsSuggested && (
          <div className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2.5 text-sm">{ra.controlsSuggested}</div>
        )}
        {expanded && ra.permit && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <span className="text-xs text-muted-foreground">{t("safety.risk.card.linkedPermit")}</span>
            <span className="font-mono text-primary">{ra.permit.permitNumber}</span>
            <span>{ra.permit.title}</span>
            <StatusBadge value={ra.permit.status} className="ms-auto" />
          </div>
        )}

        {/* Meta + actions */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {ra.site.code} — {ra.site.name}</span>
          <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {ra.conductedBy.name}</span>
          <div className="ms-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp /> : <ChevronDown />}
              {expanded ? t("safety.risk.card.less") : t("safety.risk.card.showControls")}
            </Button>
            {ra.status === "DRAFT" && (
              <Button size="sm" variant="outline" onClick={() => changeStatus("APPROVED")} disabled={updating}>
                {updating ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {t("safety.risk.card.approve")}
              </Button>
            )}
            {ra.status === "APPROVED" && (
              <Button size="sm" variant="outline" onClick={() => changeStatus("EXPIRED")} disabled={updating}>
                {updating ? <Loader2 className="animate-spin" /> : <Clock />} {t("safety.risk.card.expire")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("num mt-1 text-2xl font-semibold", tone)}>{value}</div>
      </CardContent>
    </Card>
  );
}
