"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Plus, X, Loader2, Star, Mail, Phone,
  FlaskConical, RefreshCw, ShieldAlert, Clock, CheckCircle2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Contractor {
  id:                 string;
  name:               string;
  companyName:        string;
  contactEmail:       string;
  contactPhone:       string | null;
  safetyRating:       number;
  status:             string;
  isAutoSuspended:    boolean;
  contractStart:      string;
  contractEnd:        string | null;
  activePermitsCount: number;
}

type Filter = "ALL" | "ACTIVE" | "SUSPENDED" | "EXPIRED";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:    "bg-green-500/15  text-green-400",
  SUSPENDED: "bg-red-500/15    text-red-400",
  EXPIRED:   "bg-muted/30      text-muted-foreground",
};
const STATUS_STRIP: Record<string, string> = {
  ACTIVE:    "bg-green-500",
  SUSPENDED: "bg-red-500",
  EXPIRED:   "bg-border",
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const [items,      setItems]      = useState<Contractor[]>([]);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [loading,    setLoading]    = useState(true);
  const [simulating, setSimulating] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/contractors?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.contractors ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const counts = {
    active:    items.filter((c) => c.status === "ACTIVE").length,
    suspended: items.filter((c) => c.status === "SUSPENDED").length,
    expired:   items.filter((c) => c.status === "EXPIRED").length,
    expiring:  items.filter((c) => {
      if (!c.contractEnd || c.status !== "ACTIVE") return false;
      return new Date(c.contractEnd).getTime() - Date.now() < 30 * 864e5;
    }).length,
  };

  async function simulate() {
    if (!confirm("Load 10 real Gulf region contractor companies?")) return;
    setSimulating(true);
    await fetch("/api/contractors/simulate", { method: "POST" });
    await loadItems();
    setSimulating(false);
  }

  async function clearSim() {
    setSimulating(true);
    await fetch("/api/contractors/simulate", { method: "DELETE" });
    await loadItems();
    setSimulating(false);
  }

  const hasSim = items.some((c) => c.name.startsWith("[SIM-CO]"));

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <Users className="h-7 w-7 text-primary" /> Contractors
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved Gulf-region contractor companies — safety ratings & contract status
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
              {simulating ? "Loading…" : "Load Gulf Companies"}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon="✅" label="Active"    value={counts.active}    tone="ok"   />
        <Kpi icon="🚫" label="Suspended" value={counts.suspended} tone="crit" />
        <Kpi icon="⏰" label="Expired"   value={counts.expired}   tone="muted"/>
        <Kpi icon="⚠️" label="Expiring Soon" value={counts.expiring} tone="warn" />
      </div>

      {/* ── Filter Tabs ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "ACTIVE", "SUSPENDED", "EXPIRED"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}>{f}</button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{items.length} companies</span>
      </div>

      {/* ══ LIST ════════════════════════════════════════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3">
          <div className="text-4xl">🏗️</div>
          <div className="font-semibold">No contractors yet</div>
          <div className="text-sm text-muted-foreground">Load sample Gulf region companies to get started.</div>
          <button onClick={simulate} disabled={simulating}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <FlaskConical className="h-4 w-4" /> Load Gulf Companies
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((c) => <ContractorCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Contractor Card
// ─────────────────────────────────────────────────────────────

function ContractorCard({ c }: { c: Contractor }) {
  const expiringSoon = c.contractEnd && c.status === "ACTIVE" &&
    new Date(c.contractEnd).getTime() - Date.now() < 30 * 864e5;

  const ratingColor = c.safetyRating >= 4.5 ? "text-green-400"
    : c.safetyRating >= 3.5 ? "text-yellow-400"
    : "text-red-400";

  const cleanName = c.name.replace("[SIM-CO] ", "");

  return (
    <div className="relative flex overflow-hidden rounded-xl border border-border/40 bg-background/60 backdrop-blur hover:border-border/70 transition-all">
      <div className={cn("w-1 shrink-0 rounded-l-xl", STATUS_STRIP[c.status] ?? "bg-border")} />
      <div className="flex-1 px-4 py-4 space-y-2.5 min-w-0">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">{cleanName}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_BADGE[c.status])}>
                {c.status}
              </span>
              {c.isAutoSuspended && (
                <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                  AUTO-SUSPENDED
                </span>
              )}
              {expiringSoon && (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                  EXPIRING
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.companyName.replace("[SIM-CO] ", "")}</div>
          </div>

          {/* Right column: Safety Rating + Active PTW badge */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <Star className={cn("h-4 w-4", ratingColor)} fill="currentColor" />
              <span className={cn("font-mono text-sm font-bold", ratingColor)}>{c.safetyRating.toFixed(1)}</span>
            </div>
            {c.activePermitsCount > 0 ? (
              <Link
                href="/operations/permits"
                className="flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                <FileText className="h-3 w-3" />
                {c.activePermitsCount} PTW
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/40">
                <FileText className="h-3 w-3" />
                0 PTW
              </span>
            )}
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{c.contactEmail}</span>
          </div>
          {c.contactPhone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" /> {c.contactPhone}
            </div>
          )}
        </div>

        {/* Contract dates */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/30 pt-2">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Start: {new Date(c.contractStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
          {c.contractEnd && (
            <span className={cn("flex items-center gap-1", expiringSoon && "text-amber-400")}>
              <Clock className="h-3 w-3" />
              End: {new Date(c.contractEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

type KpiTone = "ok" | "crit" | "warn" | "muted";

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: KpiTone }) {
  const cls: Record<KpiTone, string> = {
    ok:    value > 0 ? "border-green-500/30 bg-green-500/5"  : "border-border/40",
    crit:  value > 0 ? "border-red-500/30   bg-red-500/5"    : "border-border/40",
    warn:  value > 0 ? "border-amber-500/40 bg-amber-500/5"  : "border-border/40",
    muted: "border-border/40",
  };
  const txt: Record<KpiTone, string> = {
    ok:    value > 0 ? "text-green-400"  : "text-muted-foreground",
    crit:  value > 0 ? "text-red-400"    : "text-muted-foreground",
    warn:  value > 0 ? "text-amber-400"  : "text-muted-foreground",
    muted: "text-muted-foreground",
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
