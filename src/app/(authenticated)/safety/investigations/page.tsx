"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link          from "next/link";
import {
  Search, Plus, X, Loader2, Brain, FlaskConical,
  RefreshCw, ChevronRight, Calendar,
  User as UserIcon, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { TONE_EDGE, toneFor } from "@/lib/ui/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Investigation {
  id:            string;
  status:        string;
  rootCause:     string | null;
  summary:       string | null;
  hasAIEvidence: boolean;
  createdAt:     string;
  incident: {
    id:             string;
    incidentNumber: string;
    title:          string;
    severity:       string;
    occurredAt:     string;
    location:       string;
  };
  leadInvestigator: { name: string; role: string };
}

interface OpenIncident {
  id:             string;
  incidentNumber: string;
  title:          string;
  severity:       string;
  status:         string;
  occurredAt:     string;
}

interface Stats {
  total: number; open: number; inReview: number; closed: number; withAI: number;
}

type Filter = "ALL" | "OPEN" | "IN_REVIEW" | "CLOSED";

const FILTERS: Filter[] = ["ALL", "OPEN", "IN_REVIEW", "CLOSED"];
/** Only HSSE roles can lead an investigation (enforced by the API too). */
const LEAD_ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"];

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function InvestigationsPage() {
  const { t } = useI18n();
  const f = useFormat();
  const [items,       setItems]       = useState<Investigation[]>([]);
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [openInc,     setOpenInc]     = useState<OpenIncident[]>([]);
  const [members,     setMembers]     = useState<{ id: string; name: string; role: string }[]>([]);
  const [filter,      setFilter]      = useState<Filter>("ALL");
  const [loading,     setLoading]     = useState(true);
  const [showNew,     setShowNew]     = useState(false);

  // ── Form state ────────────────────────────────────────────
  const [selIncident, setSelIncident] = useState("");
  const [selLead,     setSelLead]     = useState("");
  const [creating,    setCreating]    = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    const r = await fetch(`/api/investigations?${params}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.investigations ?? []);
    setLoading(false);
  }, [filter]);

  const loadStats = useCallback(async () => {
    const r = await fetch("/api/investigations?stats=1");
    const j = await r.json();
    if (j.ok) setStats(j.data);
  }, []);

  const loadOpenIncidents = useCallback(async () => {
    const r = await fetch("/api/investigations?openIncidents=1");
    const j = await r.json();
    if (j.ok) setOpenInc(j.data.incidents ?? []);
  }, []);

  const loadMembers = useCallback(async () => {
    const r = await fetch("/api/tasks?members=1");
    const j = await r.json();
    if (j.ok) setMembers((j.data.users ?? []).filter((u: { role: string }) => LEAD_ROLES.includes(u.role)));
  }, []);

  useEffect(() => { loadList(); loadStats(); }, [loadList, loadStats]);
  useEffect(() => { if (showNew) { loadOpenIncidents(); loadMembers(); } }, [showNew, loadOpenIncidents, loadMembers]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!selIncident) return;
    setCreating(true);
    setFormError(null);
    const r = await fetch("/api/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: selIncident, leadInvestigatorId: selLead || undefined }),
    });
    const j = await r.json();
    if (j.ok) {
      setShowNew(false); setSelIncident(""); setSelLead("");
      await Promise.all([loadList(), loadStats(), loadOpenIncidents()]);
    } else {
      setFormError(j.error?.message ?? t("safety.inv.form.failed"));
    }
    setCreating(false);
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><Search className="h-6 w-6 text-primary" /> {t("safety.inv.title")}</span>}
        description={t("safety.inv.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t("safety.inv.refresh")} onClick={() => { loadList(); loadStats(); }}>
              <RefreshCw />
            </Button>
            <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
              {showNew ? <><X /> {t("safety.inv.cancel")}</> : <><Plus /> {t("safety.inv.new")}</>}
            </Button>
          </>
        }
      />

      {/* ── KPI strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label={t("safety.inv.kpi.total")}    value={stats?.total    ?? 0} />
        <Kpi label={t("safety.inv.kpi.open")}     value={stats?.open     ?? 0} tone="text-warning" />
        <Kpi label={t("safety.inv.kpi.inReview")} value={stats?.inReview ?? 0} tone="text-info" />
        <Kpi label={t("safety.inv.kpi.closed")}   value={stats?.closed   ?? 0} tone="text-success" />
        <Kpi label={t("safety.inv.kpi.ai")}       value={stats?.withAI   ?? 0} tone="text-primary" />
      </div>

      {/* ══ New investigation form ══════════════════════════ */}
      {showNew && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4 text-primary" /> {t("safety.inv.form.heading")}
            </h2>
            {openInc.length === 0 ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{t("safety.inv.form.noIncidents")}</p>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-incident">{t("safety.inv.form.incident")}</Label>
                    <NativeSelect id="inv-incident" value={selIncident} onChange={(e) => setSelIncident(e.target.value)} required>
                      <option value="">{t("safety.inv.form.incidentPh")}</option>
                      {openInc.map((inc) => (
                        <option key={inc.id} value={inc.id}>
                          [{f.enum("severity", inc.severity)}] {inc.incidentNumber} — {inc.title.slice(0, 60)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-lead">{t("safety.inv.form.lead")}</Label>
                    <NativeSelect id="inv-lead" value={selLead} onChange={(e) => setSelLead(e.target.value)}>
                      <option value="">{t("safety.inv.form.leadPh")}</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({t(`roles.${m.role}` as MessageKey)})</option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                {formError && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowNew(false)}>{t("safety.inv.cancel")}</Button>
                  <Button type="submit" disabled={creating || !selIncident}>
                    {creating ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                    {t("safety.inv.form.open")}
                  </Button>
                </div>
              </form>
            )}
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
            {t(`safety.inv.filter.${v}` as MessageKey)}
          </button>
        ))}
      </div>

      {/* ══ LIST ════════════════════════════════════════════ */}
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("safety.inv.empty")}
          description={t("safety.inv.emptyHint")}
          action={<Button onClick={() => setShowNew(true)}><Plus /> {t("safety.inv.new")}</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((inv) => <InvestigationCard key={inv.id} inv={inv} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Investigation Card
// ─────────────────────────────────────────────────────────────

function InvestigationCard({ inv }: { inv: Investigation }) {
  const { t } = useI18n();
  const f = useFormat();
  // Try to parse AI analysis from summary
  let aiSummary: string | null = null;
  let riskLevel: string | null = null;
  if (inv.summary) {
    try {
      const parsed = JSON.parse(inv.summary) as { summary?: string; riskLevel?: string };
      aiSummary = parsed.summary ?? null;
      riskLevel = parsed.riskLevel ?? null;
    } catch { aiSummary = inv.summary; }
  }

  return (
    <Card className={cn("flex overflow-hidden border-s-4", TONE_EDGE[toneFor(inv.incident.severity)])}>
      <CardContent className="min-w-0 flex-1 space-y-2.5 p-4">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{inv.incident.incidentNumber}</span>
          <StatusBadge value={inv.incident.severity} group="severity" />
          <StatusBadge value={inv.status} />
          {inv.hasAIEvidence && (
            <span className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              <Brain className="h-3 w-3" /> {t("safety.inv.aiAnalysed")}
            </span>
          )}
          {riskLevel && (
            <StatusBadge value={riskLevel} group="severity" className="opacity-90" />
          )}
        </div>

        {/* Title */}
        <div className="text-sm font-semibold leading-snug">{inv.incident.title}</div>

        {/* AI summary or root cause */}
        {(aiSummary || inv.rootCause) && (
          <div className="line-clamp-2 border-s-2 border-primary/30 ps-2.5 text-sm text-muted-foreground">
            {aiSummary ?? inv.rootCause}
          </div>
        )}

        {!inv.hasAIEvidence && !inv.rootCause && (
          <div className="text-xs italic text-muted-foreground">{t("safety.inv.noAnalysis")}</div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {inv.incident.location}</span>
          <span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" /> {inv.leadInvestigator.name}</span>
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {f.date(inv.incident.occurredAt)}</span>
        </div>
      </CardContent>

      {/* Open */}
      <Link href={`/safety/investigations/${inv.id}`} aria-label={t("safety.inv.open")}
        className="flex items-center border-s border-border px-4 text-muted-foreground transition-colors hover:text-primary">
        <ChevronRight className="h-5 w-5 rtl:rotate-180" />
      </Link>
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
