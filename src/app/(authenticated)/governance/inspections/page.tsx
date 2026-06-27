"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, Loader2, X, FlaskConical, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, RotateCcw, Brain,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Inspection {
  id:            string;
  title:         string;
  type:          string;
  status:        string;
  fraudDetected: boolean;
  fraudReason:   string | null;
  conductedAt:   string | null;
  notes:         string | null;
  createdAt:     string;
  site:        { code: string; name: string };
  conductedBy: { name: string; role: string };
}

// tracks incidentId created per inspection id
type CreatedMap = Record<string, string>;

type Filter = "ALL" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

const STATUS_STRIP: Record<string, string> = {
  SCHEDULED:   "bg-primary",
  IN_PROGRESS: "bg-amber-500",
  COMPLETED:   "bg-green-500",
  FAILED:      "bg-red-500",
};
const STATUS_BADGE: Record<string, string> = {
  SCHEDULED:   "bg-primary/15    text-primary",
  IN_PROGRESS: "bg-amber-500/15  text-amber-400",
  COMPLETED:   "bg-green-500/15  text-green-400",
  FAILED:      "bg-red-500/15    text-red-400",
};
const TYPE_ICON: Record<string, string> = {
  FIRE_SAFETY:    "🔥",
  ELECTRICAL:     "⚡",
  MECHANICAL:     "⚙️",
  HOUSEKEEPING:   "🧹",
  PPE:            "🦺",
  ENVIRONMENTAL:  "🌿",
  PROCESS_SAFETY: "🏭",
  SITE_SAFETY:    "🏗️",
};

export default function InspectionsPage() {
  const [items,      setItems]      = useState<Inspection[]>([]);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [loading,    setLoading]    = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [creating,   setCreating]   = useState<string | null>(null);   // inspectionId being processed
  const [created,    setCreated]    = useState<CreatedMap>({});         // inspectionId → incidentId

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/inspections?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.inspections ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const counts = {
    scheduled:  items.filter((i) => i.status === "SCHEDULED").length,
    inProgress: items.filter((i) => i.status === "IN_PROGRESS").length,
    completed:  items.filter((i) => i.status === "COMPLETED").length,
    failed:     items.filter((i) => i.status === "FAILED").length,
    fraud:      items.filter((i) => i.fraudDetected).length,
  };

  async function simulate() {
    if (!confirm("Create sample inspection records?")) return;
    setSimulating(true);
    await fetch("/api/inspections/simulate", { method: "POST" });
    await loadItems();
    setSimulating(false);
  }

  async function clearSim() {
    setSimulating(true);
    await fetch("/api/inspections/simulate", { method: "DELETE" });
    await loadItems();
    setSimulating(false);
  }

  async function createIncident(ins: Inspection) {
    setCreating(ins.id);
    try {
      const r = await fetch(`/api/inspections/${ins.id}/create-incident`, { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setCreated((prev) => ({ ...prev, [ins.id]: j.data.incidentId }));
      }
    } finally {
      setCreating(null);
    }
  }

  const hasSim = items.some((i) => i.title.startsWith("[SIM-INS]"));

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <ClipboardList className="h-7 w-7 text-primary" /> Inspections
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Site inspections with AI fraud-detection on photo evidence
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadItems} className="rounded-lg border border-border/40 p-2.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />
          </button>
          {hasSim ? (
            <button onClick={clearSim} disabled={simulating}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50">
              {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Clear Sim
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

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi icon="📅" label="Scheduled"   value={counts.scheduled}  tone="info"  />
        <Kpi icon="🔄" label="In Progress" value={counts.inProgress} tone="warn"  />
        <Kpi icon="✅" label="Completed"   value={counts.completed}  tone="ok"    />
        <Kpi icon="❌" label="Failed"      value={counts.failed}     tone="crit"  />
        <Kpi icon="🚨" label="Fraud Flags" value={counts.fraud}      tone="fraud" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}>{f.replace("_", " ")}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{items.length} record{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <div className="font-semibold">No inspections yet</div>
          <div className="text-sm text-muted-foreground">Load simulation data to see the inspection system in action.</div>
          <button onClick={simulate} disabled={simulating}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <FlaskConical className="h-4 w-4" /> Simulate
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((ins) => (
            <div key={ins.id} className={cn(
              "relative flex overflow-hidden rounded-xl border bg-background/60 backdrop-blur transition-all",
              ins.fraudDetected ? "border-red-500/40 hover:border-red-500/60" : "border-border/40 hover:border-border/70"
            )}>
              <div className={cn("w-1 shrink-0 rounded-l-xl", STATUS_STRIP[ins.status] ?? "bg-border")} />
              <div className="flex-1 px-4 py-3.5 space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base shrink-0">{TYPE_ICON[ins.type] ?? "📋"}</span>
                  <span className="font-semibold text-sm">{ins.title.replace(/^\[SIM-INS\] /, "")}</span>
                  <span className="rounded border border-border/40 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ins.type.replace("_", " ")}
                  </span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[ins.status])}>
                    {ins.status.replace("_", " ")}
                  </span>
                  {ins.fraudDetected && (
                    <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400 flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> FRAUD DETECTED
                    </span>
                  )}
                  {ins.status === "COMPLETED" && !ins.fraudDetected && (
                    <span className="rounded border border-green-500/30 bg-green-500/8 px-1.5 py-0.5 text-[10px] text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> VERIFIED
                    </span>
                  )}
                  {ins.status === "COMPLETED" && ins.fraudDetected && (
                    <span className="rounded border border-amber-500/30 bg-amber-500/8 px-1.5 py-0.5 text-[10px] text-amber-400 flex items-center gap-1">
                      <Brain className="h-2.5 w-2.5" /> AI FLAGGED
                    </span>
                  )}
                </div>
                {ins.fraudReason && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                    <span className="font-semibold">Fraud reason: </span>{ins.fraudReason}
                  </div>
                )}
                {ins.notes && !ins.fraudReason && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{ins.notes}</p>
                )}
                {/* Create Incident — only for FAILED inspections */}
                {ins.status === "FAILED" && (
                  <div className="flex items-center gap-2">
                    {created[ins.id] ? (
                      <a href={`/safety/incidents`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/8 px-2.5 py-1 text-[10px] text-green-400 hover:bg-green-500/15 transition-colors">
                        <CheckCircle2 className="h-3 w-3" /> Incident Created — View
                      </a>
                    ) : (
                      <button
                        onClick={() => createIncident(ins)}
                        disabled={creating === ins.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/8 px-2.5 py-1 text-[10px] text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50">
                        {creating === ins.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <PlusCircle className="h-3 w-3" />}
                        {creating === ins.id ? "Creating…" : "Create Incident"}
                      </button>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span>📍 {ins.site.code} — {ins.site.name}</span>
                  <span>👤 {ins.conductedBy.name}</span>
                  <span className="ml-auto flex items-center gap-1">
                    {ins.status === "IN_PROGRESS" && <RotateCcw className="h-3 w-3 text-amber-400" />}
                    {ins.status === "SCHEDULED"   && <Clock className="h-3 w-3" />}
                    {ins.conductedAt
                      ? `Completed ${new Date(ins.conductedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                      : `Scheduled ${new Date(ins.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type KpiTone = "info" | "warn" | "ok" | "crit" | "fraud";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const cls: Record<KpiTone, string> = {
    info:  value > 0 ? "border-primary/30    bg-primary/5"    : "border-border/40",
    warn:  value > 0 ? "border-amber-500/40  bg-amber-500/5"  : "border-border/40",
    ok:    value > 0 ? "border-green-500/30  bg-green-500/5"  : "border-border/40",
    crit:  value > 0 ? "border-red-500/30    bg-red-500/5"    : "border-border/40",
    fraud: value > 0 ? "border-red-500/50    bg-red-500/10"   : "border-border/40",
  };
  const txt: Record<KpiTone, string> = {
    info:  value > 0 ? "text-primary"   : "text-muted-foreground",
    warn:  value > 0 ? "text-amber-400" : "text-muted-foreground",
    ok:    value > 0 ? "text-green-400" : "text-muted-foreground",
    crit:  value > 0 ? "text-red-400"   : "text-muted-foreground",
    fraud: value > 0 ? "text-red-400"   : "text-muted-foreground",
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
