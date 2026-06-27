"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileCheck, Plus, X, Loader2, FlaskConical, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ComplianceItem {
  id:              string;
  title:           string;
  regulationRef:   string;
  status:          string;
  dueDate:         string;
  isAutoEscalated: boolean;
  triggersLockdown:boolean;
  site:        { code: string; name: string };
  responsible: { name: string; role: string };
}

type Filter = "ALL" | "PENDING" | "COMPLIANT" | "OVERDUE";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STATUS_STRIP: Record<string, string> = {
  PENDING:   "bg-amber-500",
  COMPLIANT: "bg-green-500",
  OVERDUE:   "bg-red-500",
  EXEMPT:    "bg-border",
};
const STATUS_BADGE: Record<string, string> = {
  PENDING:   "bg-amber-500/15  text-amber-400",
  COMPLIANT: "bg-green-500/15  text-green-400",
  OVERDUE:   "bg-red-500/15    text-red-400",
  EXEMPT:    "bg-muted/30      text-muted-foreground",
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [items,      setItems]      = useState<ComplianceItem[]>([]);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [loading,    setLoading]    = useState(true);
  const [simulating, setSimulating] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/compliance/items?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.items ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const counts = {
    pending:   items.filter((i) => i.status === "PENDING").length,
    compliant: items.filter((i) => i.status === "COMPLIANT").length,
    overdue:   items.filter((i) => i.status === "OVERDUE" || (i.status === "PENDING" && new Date(i.dueDate) < new Date())).length,
    lockdown:  items.filter((i) => i.triggersLockdown).length,
  };

  async function simulate() {
    if (!confirm("Create 10 sample compliance items?")) return;
    setSimulating(true);
    await fetch("/api/compliance/items/simulate", { method: "POST" });
    await loadItems();
    setSimulating(false);
  }

  async function clearSim() {
    setSimulating(true);
    await fetch("/api/compliance/items/simulate", { method: "DELETE" });
    await loadItems();
    setSimulating(false);
  }

  const hasSim = items.some((i) => i.title.startsWith("[SIM-CI]"));

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <FileCheck className="h-7 w-7 text-primary" /> Compliance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Regulatory obligations — MoEM, ISO 45001, PDPL, internal HSSE policy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadItems}
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
        </div>
      </div>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon="⏳" label="Pending"   value={counts.pending}   tone="warn" />
        <Kpi icon="✅" label="Compliant" value={counts.compliant} tone="ok"   />
        <Kpi icon="🔴" label="Overdue"   value={counts.overdue}   tone="crit" />
        <Kpi icon="🔒" label="Triggers Lockdown" value={counts.lockdown} tone="lock" />
      </div>

      {/* ── Filter Tabs ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "PENDING", "COMPLIANT", "OVERDUE"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}>{f}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ══ LIST ════════════════════════════════════════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3">
          <div className="text-4xl">📋</div>
          <div className="font-semibold">No compliance items</div>
          <div className="text-sm text-muted-foreground max-w-sm mx-auto">Load simulation data to see how compliance tracking works.</div>
          <button onClick={simulate} disabled={simulating}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <FlaskConical className="h-4 w-4" /> Simulate
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => <ComplianceCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compliance Card
// ─────────────────────────────────────────────────────────────

function ComplianceCard({ item }: { item: ComplianceItem }) {
  const now     = new Date();
  const due     = new Date(item.dueDate);
  const overdue = item.status === "PENDING" && due < now;
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 864e5);
  const effectiveStatus = overdue ? "OVERDUE" : item.status;

  return (
    <div className={cn(
      "relative flex overflow-hidden rounded-xl border bg-background/60 backdrop-blur transition-all",
      effectiveStatus === "OVERDUE" ? "border-red-500/30 hover:border-red-500/50"
        : effectiveStatus === "COMPLIANT" ? "border-green-500/20 hover:border-green-500/40"
        : "border-border/40 hover:border-border/70"
    )}>
      <div className={cn("w-1 shrink-0 rounded-l-xl", STATUS_STRIP[effectiveStatus] ?? "bg-border")} />

      <div className="flex-1 px-4 py-3.5 space-y-2 min-w-0">
        {/* Top row */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusIcon status={effectiveStatus} />
          <span className="font-semibold text-sm">{item.title.replace("[SIM-CI] ", "")}</span>
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[effectiveStatus])}>
            {effectiveStatus}
          </span>
          {item.triggersLockdown && (
            <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400 flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" /> LOCKDOWN TRIGGER
            </span>
          )}
          {item.isAutoEscalated && (
            <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">AUTO-ESC</span>
          )}
        </div>

        {/* Regulation + due date */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="font-mono bg-muted/30 px-1.5 py-0.5 rounded">{item.regulationRef}</span>
          <span className="flex items-center gap-1">📍 {item.site.code}</span>
          <span className="flex items-center gap-1">👤 {item.responsible.name}</span>
          <span className={cn(
            "flex items-center gap-1 ml-auto font-medium",
            effectiveStatus === "OVERDUE" ? "text-red-400"
              : daysLeft <= 14 ? "text-amber-400"
              : "text-muted-foreground"
          )}>
            <Clock className="h-3 w-3" />
            {effectiveStatus === "OVERDUE"
              ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""}`
              : `Due ${due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} (${daysLeft}d)`}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLIANT") return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === "OVERDUE")   return <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />;
  return <Clock className="h-4 w-4 text-amber-400 shrink-0" />;
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

type KpiTone = "warn" | "ok" | "crit" | "lock";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const cls: Record<KpiTone, string> = {
    warn: value > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border/40",
    ok:   value > 0 ? "border-green-500/30 bg-green-500/5" : "border-border/40",
    crit: value > 0 ? "border-red-500/30   bg-red-500/5"   : "border-border/40",
    lock: value > 0 ? "border-red-500/40   bg-red-500/8"   : "border-border/40",
  };
  const txt: Record<KpiTone, string> = {
    warn: value > 0 ? "text-amber-400"  : "text-muted-foreground",
    ok:   value > 0 ? "text-green-400"  : "text-muted-foreground",
    crit: value > 0 ? "text-red-400"    : "text-muted-foreground",
    lock: value > 0 ? "text-red-400"    : "text-muted-foreground",
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
