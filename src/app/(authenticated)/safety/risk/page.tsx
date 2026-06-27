"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ShieldAlert, Plus, X, Loader2, Brain, FlaskConical,
  CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronUp,
  Link2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const RISK_STRIP: Record<string, string> = {
  LOW:      "bg-green-500",
  MEDIUM:   "bg-yellow-500",
  HIGH:     "bg-orange-500",
  CRITICAL: "bg-red-500",
};
const RISK_BADGE: Record<string, string> = {
  LOW:      "border-green-500/40  bg-green-500/10  text-green-400",
  MEDIUM:   "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
  HIGH:     "border-orange-500/40 bg-orange-500/10 text-orange-400",
  CRITICAL: "border-red-500/40    bg-red-500/10    text-red-400",
};
const STATUS_BADGE: Record<string, string> = {
  DRAFT:    "bg-muted/30         text-muted-foreground",
  APPROVED: "bg-green-500/15     text-green-400",
  EXPIRED:  "bg-orange-500/15    text-orange-400",
};
const TYPES = ["CHEMICAL", "PHYSICAL", "ELECTRICAL", "FIRE", "ERGONOMIC", "BIOLOGICAL", "PROCESS_SAFETY", "MECHANICAL", "ENVIRONMENTAL", "GENERAL"];
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function RiskAssessmentPage() {
  const [items,      setItems]      = useState<RiskAssessment[]>([]);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [simulating, setSimulating] = useState(false);
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
    if (j.ok) setSites(j.data.sites ?? []);
  }, []);

  const loadPermits = useCallback(async () => {
    const r = await fetch("/api/permits?status=APPROVED&limit=50");
    const j = await r.json();
    if (j.ok) setPermits(j.data.permits ?? []);
  }, []);

  useEffect(() => { loadItems(); loadStats(); }, [loadItems, loadStats]);
  useEffect(() => { if (showNew) { loadSites(); loadPermits(); } }, [showNew, loadSites, loadPermits]);

  async function suggestControls() {
    if (!fHazard) return;
    setAiLoading(true);
    const r = await fetch("/api/risk-assessments/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hazardDescription: fHazard, type: fType, riskBefore: fBefore }),
    });
    const j = await r.json();
    if (j.ok) { setFControls(j.data.controlsSuggested); setFAfter(j.data.riskAfter); }
    setAiLoading(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    const r = await fetch("/api/risk-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fTitle, type: fType, hazardDescription: fHazard,
        riskBefore: fBefore, controlsSuggested: fControls, riskAfter: fAfter,
        siteId: fSite || sites[0]?.id,
        aiSuggested: !!fControls,
        permitId: fPermit || null,
      }),
    });
    const j = await r.json();
    if (j.ok) { setShowNew(false); resetForm(); await Promise.all([loadItems(), loadStats()]); }
    setCreating(false);
  }

  function resetForm() {
    setFTitle(""); setFType("CHEMICAL"); setFHazard(""); setFBefore("HIGH");
    setFControls(""); setFAfter("LOW"); setFSite(""); setFPermit("");
  }

  async function updateStatus(id: string, status: string) {
    await fetch("/api/risk-assessments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await Promise.all([loadItems(), loadStats()]);
  }

  async function simulate() {
    if (!confirm("Create 5 sample risk assessments?")) return;
    setSimulating(true);
    await fetch("/api/risk-assessments/simulate", { method: "POST" });
    await Promise.all([loadItems(), loadStats()]);
    setSimulating(false);
  }

  async function clearSim() {
    setSimulating(true);
    await fetch("/api/risk-assessments/simulate", { method: "DELETE" });
    await Promise.all([loadItems(), loadStats()]);
    setSimulating(false);
  }

  const hasSim = items.some((i) => i.title.startsWith("[SIM-RA]"));

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="h-7 w-7 text-primary" /> Risk Assessment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hazard identification, risk scoring, AI-recommended controls, and PTW linking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadItems(); loadStats(); }}
            className="rounded-lg border border-border/40 p-2.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </button>
          {hasSim ? (
            <button onClick={clearSim} disabled={simulating}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50">
              {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Clear Sim
            </button>
          ) : (
            <button onClick={simulate} disabled={simulating}
              className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50">
              {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
              {simulating ? "Loading…" : "Simulate"}
            </button>
          )}
          <button onClick={() => setShowNew((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              showNew ? "bg-muted text-muted-foreground border border-border" : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}>
            {showNew ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> New Assessment</>}
          </button>
        </div>
      </div>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi icon="📋" label="Total"       value={stats?.total    ?? 0} tone="neutral" />
        <Kpi icon="✏️" label="Draft"       value={stats?.draft    ?? 0} tone="info"    />
        <Kpi icon="✅" label="Approved"    value={stats?.approved ?? 0} tone="ok"      />
        <Kpi icon="⏰" label="Expired"     value={stats?.expired  ?? 0} tone="warn"    />
        <Kpi icon="🤖" label="AI Assisted" value={stats?.withAI   ?? 0} tone="ai"      />
      </div>

      {/* ══ NEW ASSESSMENT FORM ══════════════════════════ */}
      {showNew && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> New Risk Assessment
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Title *</label>
                <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} required
                  placeholder="e.g. H2S Exposure Risk — Well Intervention"
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type *</label>
                <select value={fType} onChange={(e) => setFType(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Risk Before Controls *</label>
                <select value={fBefore} onChange={(e) => setFBefore(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hazard Description *</label>
                  <button type="button" onClick={suggestControls} disabled={aiLoading || !fHazard}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-40">
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                    {aiLoading ? "Analysing…" : "AI Suggest Controls"}
                  </button>
                </div>
                <textarea value={fHazard} onChange={(e) => setFHazard(e.target.value)} required rows={2}
                  placeholder="Describe the hazard in detail…"
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Controls Suggested
                  {fControls && <span className="ml-2 text-primary">✓ AI filled</span>}
                </label>
                <textarea value={fControls} onChange={(e) => setFControls(e.target.value)} rows={3}
                  placeholder="Describe the control measures…"
                  className={cn(
                    "w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none resize-none",
                    fControls ? "border-primary/40 focus:border-primary" : "border-border/60 focus:border-primary"
                  )} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Risk After Controls</label>
                <select value={fAfter} onChange={(e) => setFAfter(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Site</label>
                <select value={fSite} onChange={(e) => setFSite(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">— Select site —</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              {/* ── Permit link ── */}
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Link to Work Permit (PTW)
                  <span className="text-muted-foreground/60 normal-case font-normal ml-1">— optional</span>
                </label>
                <select value={fPermit} onChange={(e) => setFPermit(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">— No permit linked —</option>
                  {permits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.permitNumber} — {p.title.slice(0, 50)}
                    </option>
                  ))}
                </select>
                {permits.length === 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">No approved permits found.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowNew(false); resetForm(); }}
                className="rounded-lg border border-border/50 px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={creating}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                Save Assessment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filter Tabs ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "DRAFT", "APPROVED", "EXPIRED"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}>{f}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{items.length} record{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ══ LIST ════════════════════════════════════════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3">
          <div className="text-4xl">🛡️</div>
          <div className="font-semibold">No risk assessments yet</div>
          <div className="text-sm text-muted-foreground max-w-sm mx-auto">Create your first assessment or load simulation data.</div>
          <div className="flex justify-center gap-2">
            <button onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New Assessment
            </button>
            <button onClick={simulate} disabled={simulating}
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              <FlaskConical className="h-4 w-4" /> Simulate
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ra) => <RiskCard key={ra.id} ra={ra} onStatusChange={updateStatus} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Risk Card
// ─────────────────────────────────────────────────────────────

function RiskCard({
  ra, onStatusChange,
}: {
  ra: RiskAssessment;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating,  setUpdating] = useState(false);

  async function changeStatus(status: string) {
    setUpdating(true);
    await onStatusChange(ra.id, status);
    setUpdating(false);
  }

  const riskReduced = ra.riskBefore !== ra.riskAfter;

  return (
    <div className="relative flex overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur hover:border-border/70 transition-all">
      {/* Risk-before color strip */}
      <div className={cn("w-1 shrink-0 rounded-l-xl", RISK_STRIP[ra.riskBefore] ?? "bg-border")} />

      <div className="flex-1 px-4 py-4 min-w-0 space-y-2.5">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {ra.type.replace("_", " ")}
          </span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[ra.status])}>
            {ra.status}
          </span>
          {ra.aiSuggested && (
            <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary flex items-center gap-1">
              <Brain className="h-2.5 w-2.5" /> AI
            </span>
          )}
          {/* Permit badge */}
          {ra.permit && (
            <a href="/operations/permits"
              className="rounded border border-primary/30 bg-primary/8 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/15 flex items-center gap-1 transition-colors">
              <Link2 className="h-2.5 w-2.5" /> PTW {ra.permit.permitNumber}
              <ExternalLink className="h-2 w-2 opacity-60" />
            </a>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {new Date(ra.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        {/* Title */}
        <div className="font-semibold text-sm leading-snug">{ra.title}</div>

        {/* Hazard */}
        <p className="text-xs text-muted-foreground line-clamp-2">{ra.hazardDescription}</p>

        {/* Risk matrix */}
        <div className="flex items-center gap-2">
          <span className={cn("rounded border px-2 py-0.5 text-[10px] font-bold", RISK_BADGE[ra.riskBefore])}>
            {ra.riskBefore}
          </span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-[10px] text-muted-foreground truncate flex-1 line-clamp-1">
            {ra.controlsSuggested ? ra.controlsSuggested.slice(0, 60) + "…" : "No controls specified"}
          </span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className={cn("rounded border px-2 py-0.5 text-[10px] font-bold", RISK_BADGE[ra.riskAfter])}>
            {ra.riskAfter}
          </span>
          {riskReduced && <span className="text-[10px] text-green-400">↓ Reduced</span>}
        </div>

        {/* Expanded controls */}
        {expanded && ra.controlsSuggested && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground whitespace-pre-wrap">
            {ra.controlsSuggested}
          </div>
        )}
        {expanded && ra.permit && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Linked Permit</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-primary">{ra.permit.permitNumber}</span>
              <span className="text-muted-foreground">—</span>
              <span>{ra.permit.title}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium ml-auto",
                ra.permit.status === "APPROVED" ? "bg-green-500/15 text-green-400" : "bg-muted/30 text-muted-foreground"
              )}>{ra.permit.status}</span>
            </div>
          </div>
        )}

        {/* Meta + actions */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>📍 {ra.site.code} — {ra.site.name}</span>
          <span>👤 {ra.conductedBy.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 rounded px-2 py-1 hover:bg-muted/30 text-muted-foreground">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Less" : "Controls"}
            </button>
            {ra.status === "DRAFT" && (
              <button onClick={() => changeStatus("APPROVED")} disabled={updating}
                className="flex items-center gap-1 rounded-lg border border-green-500/40 bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/20 disabled:opacity-50">
                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Approve
              </button>
            )}
            {ra.status === "APPROVED" && (
              <button onClick={() => changeStatus("EXPIRED")} disabled={updating}
                className="flex items-center gap-1 rounded-lg border border-orange-500/30 bg-orange-500/8 px-2 py-1 text-[10px] text-orange-400 hover:bg-orange-500/15 disabled:opacity-50">
                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />} Expire
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

type KpiTone = "neutral" | "info" | "ok" | "warn" | "ai";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const cls: Record<KpiTone, string> = {
    neutral: "border-border/40",
    info:    value > 0 ? "border-primary/30  bg-primary/5"    : "border-border/40",
    ok:      value > 0 ? "border-green-500/30 bg-green-500/5" : "border-border/40",
    warn:    value > 0 ? "border-amber-500/40 bg-amber-500/5"  : "border-border/40",
    ai:      value > 0 ? "border-primary/40  bg-primary/5"    : "border-border/40",
  };
  const txt: Record<KpiTone, string> = {
    neutral: "text-foreground",
    info:    value > 0 ? "text-primary"   : "text-muted-foreground",
    ok:      value > 0 ? "text-green-400" : "text-muted-foreground",
    warn:    value > 0 ? "text-amber-400" : "text-muted-foreground",
    ai:      value > 0 ? "text-primary"   : "text-muted-foreground",
  };
  return (
    <div className={cn("rounded-xl border p-4", cls[tone])}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className={cn("mt-1.5 font-display text-2xl tabular-nums", txt[tone])}>{value}</div>
    </div>
  );
}
