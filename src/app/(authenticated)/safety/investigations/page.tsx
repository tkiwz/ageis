"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link          from "next/link";
import {
  Search, Plus, X, Loader2, Brain, FlaskConical,
  AlertTriangle, RefreshCw, ChevronRight, Calendar,
  User as UserIcon, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SEV_STRIP: Record<string, string> = {
  LOW:      "bg-green-500",
  MEDIUM:   "bg-yellow-500",
  HIGH:     "bg-orange-500",
  CRITICAL: "bg-red-500",
};
const SEV_BADGE: Record<string, string> = {
  LOW:      "border-green-500/40  text-green-400",
  MEDIUM:   "border-yellow-500/40 text-yellow-400",
  HIGH:     "border-orange-500/40 text-orange-400",
  CRITICAL: "border-red-500/40    text-red-400",
};
const STATUS_BADGE: Record<string, string> = {
  OPEN:      "bg-amber-500/15  text-amber-400",
  IN_REVIEW: "bg-primary/15    text-primary",
  CLOSED:    "bg-green-500/15  text-green-400",
};

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function InvestigationsPage() {
  const [items,       setItems]       = useState<Investigation[]>([]);
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [openInc,     setOpenInc]     = useState<OpenIncident[]>([]);
  const [members,     setMembers]     = useState<{ id: string; name: string; role: string }[]>([]);
  const [filter,      setFilter]      = useState<Filter>("ALL");
  const [loading,     setLoading]     = useState(true);
  const [showNew,     setShowNew]     = useState(false);
  const [simulating,  setSimulating]  = useState(false);

  // ── Form state ────────────────────────────────────────────
  const [selIncident, setSelIncident] = useState("");
  const [selLead,     setSelLead]     = useState("");
  const [creating,    setCreating]    = useState(false);

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
    if (j.ok) setMembers(j.data.users ?? []);
  }, []);

  useEffect(() => { loadList(); loadStats(); }, [loadList, loadStats]);
  useEffect(() => { if (showNew) { loadOpenIncidents(); loadMembers(); } }, [showNew, loadOpenIncidents, loadMembers]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!selIncident) return;
    setCreating(true);
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
      alert(j.error?.message ?? "Failed to open investigation");
    }
    setCreating(false);
  }

  async function simulate() {
    if (!confirm("Create 3 sample investigations with AI analysis?")) return;
    setSimulating(true);
    await fetch("/api/investigations/simulate", { method: "POST" });
    await Promise.all([loadList(), loadStats()]);
    setSimulating(false);
  }

  async function clearSim() {
    setSimulating(true);
    await fetch("/api/investigations/simulate", { method: "DELETE" });
    await Promise.all([loadList(), loadStats()]);
    setSimulating(false);
  }

  const hasSim = items.some((i) => i.incident.title.startsWith("[SIM-INV]"));

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <Search className="h-7 w-7 text-primary" />
            Investigations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Root-cause investigations with AI-assisted 5-Whys analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadList(); loadStats(); }}
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
              showNew
                ? "bg-muted text-muted-foreground border border-border"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}>
            {showNew ? <><X className="h-4 w-4" /> Cancel</> : <><Plus className="h-4 w-4" /> New Investigation</>}
          </button>
        </div>
      </div>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi icon="📋" label="Total"       value={stats?.total   ?? 0} tone="neutral" />
        <Kpi icon="🔍" label="Open"        value={stats?.open    ?? 0} tone="warn"    />
        <Kpi icon="⏳" label="In Review"   value={stats?.inReview ?? 0} tone="info"   />
        <Kpi icon="✅" label="Closed"      value={stats?.closed  ?? 0} tone="ok"      />
        <Kpi icon="🤖" label="AI Analysed" value={stats?.withAI  ?? 0} tone="ai"      />
      </div>

      {/* ══ NEW INVESTIGATION FORM ═══════════════════════ */}
      {showNew && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Open New Investigation
          </h2>
          {openInc.length === 0 ? (
            <div className="rounded-lg border border-border/30 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              No incidents without an investigation. All incidents have investigations or no incidents exist yet.
              <button onClick={simulate} disabled={simulating} className="ml-2 text-primary hover:underline text-xs">
                Load simulation data
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Incident *
                  </label>
                  <select value={selIncident} onChange={(e) => setSelIncident(e.target.value)} required
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">— Select incident —</option>
                    {openInc.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        [{inc.severity}] {inc.incidentNumber} — {inc.title.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Lead Investigator
                  </label>
                  <select value={selLead} onChange={(e) => setSelLead(e.target.value)}
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">— Current user —</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNew(false)}
                  className="rounded-lg border border-border/50 px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" disabled={creating || !selIncident}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Open Investigation
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Filter Tabs ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "OPEN", "IN_REVIEW", "CLOSED"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}>
            {f.replace("_", " ")}
          </button>
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
          <div className="text-4xl">🔍</div>
          <div className="font-semibold">No investigations yet</div>
          <div className="text-sm text-muted-foreground max-w-sm mx-auto">
            Open an investigation from an existing incident, or load simulation data to see how it works.
          </div>
          <div className="flex justify-center gap-2">
            <button onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-4 w-4" /> New Investigation
            </button>
            <button onClick={simulate} disabled={simulating}
              className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              <FlaskConical className="h-4 w-4" /> Simulate
            </button>
          </div>
        </div>
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
    <div className="relative flex overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur hover:border-border/70 transition-all">
      {/* Severity strip */}
      <div className={cn("w-1 shrink-0 rounded-l-xl", SEV_STRIP[inv.incident.severity] ?? "bg-border")} />

      <div className="flex-1 px-4 py-4 min-w-0 space-y-2.5">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{inv.incident.incidentNumber}</span>
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", SEV_BADGE[inv.incident.severity])}>
            {inv.incident.severity}
          </span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[inv.status] ?? "bg-muted/30 text-muted-foreground")}>
            {inv.status.replace("_", " ")}
          </span>
          {inv.hasAIEvidence && (
            <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary flex items-center gap-1">
              <Brain className="h-2.5 w-2.5" /> AI ANALYSED
            </span>
          )}
          {riskLevel && (
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              riskLevel === "CRITICAL" ? "bg-red-500/15 text-red-400" :
              riskLevel === "HIGH"     ? "bg-orange-500/15 text-orange-400" :
              riskLevel === "MEDIUM"   ? "bg-yellow-500/15 text-yellow-400" : "bg-green-500/15 text-green-400"
            )}>
              {riskLevel} RISK
            </span>
          )}
        </div>

        {/* Title */}
        <div className="font-semibold text-sm leading-snug">{inv.incident.title}</div>

        {/* AI summary or root cause */}
        {(aiSummary || inv.rootCause) && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2.5 line-clamp-2">
            {aiSummary ?? inv.rootCause}
          </div>
        )}

        {!inv.hasAIEvidence && !inv.rootCause && (
          <div className="text-xs text-muted-foreground/60 italic">
            No analysis yet — open investigation to run AI 5-Whys
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {inv.incident.location}</span>
          <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {inv.leadInvestigator.name}</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(inv.incident.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <Link href={`/safety/investigations/${inv.id}`}
        className="flex items-center px-4 border-l border-border/30 text-muted-foreground hover:text-primary transition-colors">
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

type KpiTone = "neutral" | "warn" | "info" | "ok" | "ai";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const cls: Record<KpiTone, { border: string; text: string }> = {
    neutral: { border: "border-border/40",                           text: "text-foreground"   },
    warn:    { border: value > 0 ? "border-amber-500/40 bg-amber-500/5"   : "border-border/40", text: value > 0 ? "text-amber-400"  : "text-muted-foreground" },
    info:    { border: value > 0 ? "border-primary/30  bg-primary/5"     : "border-border/40", text: value > 0 ? "text-primary"    : "text-muted-foreground" },
    ok:      { border: value > 0 ? "border-green-500/30 bg-green-500/5"  : "border-border/40", text: value > 0 ? "text-green-400"  : "text-muted-foreground" },
    ai:      { border: value > 0 ? "border-primary/40  bg-primary/8"     : "border-border/40", text: value > 0 ? "text-primary"    : "text-muted-foreground" },
  };
  return (
    <div className={cn("rounded-xl border p-4", cls[tone].border)}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className={cn("mt-1.5 font-display text-2xl tabular-nums", cls[tone].text)}>{value}</div>
    </div>
  );
}
