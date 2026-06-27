"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye, MapPin, Loader2, Upload, X, FileSpreadsheet,
  Brain, ChevronDown, ChevronUp, CheckCircle2,
  AlertTriangle, Plus, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Observation {
  id:            string;
  recordNumber:  string;
  type:          string;
  status:        string;
  location:      string;
  findings:      string;
  unsafeDetail:  string | null;
  contractor:    string | null;
  observedAt:    string;
  site:          { code: string; name: string } | null;
  reportedBy:    { name: string; role: string };
}

interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   { row: number; reason: string }[];
  analysis: string;
}

type Filter = "ALL" | "OPEN" | "RESOLVED";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  UNSAFE_CONDITION: { label: "Unsafe Condition", color: "border-yellow-500/50 text-yellow-400",  icon: "⚠️" },
  UNSAFE_ACT:       { label: "Unsafe Act",        color: "border-orange-500/50 text-orange-400",  icon: "🚷" },
  NEAR_MISS:        { label: "Near Miss",         color: "border-red-500/50    text-red-400",     icon: "🚨" },
  POSITIVE:         { label: "Positive",          color: "border-green-500/50  text-green-400",   icon: "✅" },
};

const STATUS_COLOR: Record<string, string> = {
  OPEN:     "bg-amber-500/15 text-amber-400",
  RESOLVED: "bg-green-500/15 text-green-400",
  DRAFT:    "bg-muted/30 text-muted-foreground",
};

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function ObservationsPage() {
  const [items,      setItems]      = useState<Observation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<Filter>("ALL");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    const r = await fetch(`/api/observations?${params}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.observations ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
            <Eye className="h-7 w-7 text-primary" />
            Safety Observations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unsafe conditions, unsafe acts, and near-miss reports from the field
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="rounded-lg border border-border/40 p-2.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowImport((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              showImport
                ? "bg-muted text-muted-foreground border border-border"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {showImport
              ? <><X className="h-4 w-4" /> Close</>
              : <><Upload className="h-4 w-4" /> Import &amp; Analyse</>
            }
          </button>
        </div>
      </div>

      {/* ══ IMPORT PANEL ════════════════════════════════════ */}
      {showImport && (
        <ImportPanel
          onDone={() => { setShowImport(false); load(); }}
        />
      )}

      {/* ── Filter Tabs ──────────────────────────────────── */}
      <div className="flex gap-2">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/50 text-muted-foreground hover:border-primary/50"
            )}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {items.length} record{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ══ OBSERVATION LIST ════════════════════════════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading observations…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/5 py-16 text-center space-y-3">
          <div className="text-4xl">ملاحظات</div>
          <div className="font-semibold">No observations yet</div>
          <div className="text-sm text-muted-foreground">
            Import historical data using the button above, or add observations from the field.
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Upload className="h-4 w-4" /> Import Excel / CSV
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((o) => <ObservationCard key={o.id} obs={o} />)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Import Panel
// ─────────────────────────────────────────────────────────────

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [file,      setFile]      = useState<File | null>(null);
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [showErrors,setShowErrors]= useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/observations/import", { method: "POST", body: fd });
    const j = await r.json();
    if (j.ok) setResult(j.data);
    else alert(j.error?.message ?? "Import failed");
    setUploading(false);
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-sm">Import Historical Observations</h2>
        <span className="text-[10px] text-muted-foreground ml-1">
          Supports .xlsx · .xls · .csv
        </span>
      </div>

      {/* Supported columns hint */}
      <div className="rounded-lg border border-border/30 bg-muted/10 px-4 py-3 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">Column headers recognised (Arabic &amp; English):</span>
        {" "}type / النوع · location / الموقع · findings / الملاحظة · unsafeDetail / التفاصيل ·
        contractor / المقاول · date / التاريخ · status / الحالة
        <br />
        <span className="text-[10px] opacity-70 mt-1 block">
          Type values: unsafe condition / unsafe act / near miss / positive (or UC / UA / NM / POS)
        </span>
      </div>

      {!result ? (
        <>
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all",
              dragging ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/50 hover:bg-muted/10"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-1">
                <FileSpreadsheet className="h-8 w-8 text-primary mx-auto" />
                <div className="font-semibold text-sm">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                <div className="text-sm text-muted-foreground">
                  Drag &amp; drop your file here, or <span className="text-primary font-medium">browse</span>
                </div>
                <div className="text-[10px] text-muted-foreground/60">.xlsx · .xls · .csv</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            {file && (
              <button
                onClick={() => setFile(null)}
                className="rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleImport}
              disabled={!file || uploading}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {uploading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…</>
                : <><Brain className="h-3.5 w-3.5" /> Import &amp; Analyse</>
              }
            </button>
          </div>
        </>
      ) : (
        /* ── Results ──────────────────────────────────────── */
        <div className="space-y-4">

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-green-500/30 bg-green-500/8 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-400" /> Imported
              </div>
              <div className="font-display text-2xl text-green-400 mt-1">{result.imported}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-400" /> Skipped
              </div>
              <div className="font-display text-2xl text-amber-400 mt-1">{result.skipped}</div>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/8 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1">
                <Brain className="h-3 w-3 text-primary" /> AI Analysis
              </div>
              <div className="font-display text-sm text-primary mt-1">Ready</div>
            </div>
          </div>

          {/* AI Analysis */}
          {result.analysis && (
            <div className="rounded-xl border border-primary/20 bg-background/60 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">AEGIS AI Analysis</span>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  AI Generated
                </span>
              </div>
              <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {result.analysis}
              </div>
            </div>
          )}

          {/* Errors (collapsible) */}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-border/40">
              <button
                onClick={() => setShowErrors((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <span>⚠️ {result.errors.length} row{result.errors.length > 1 ? "s" : ""} skipped</span>
                {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showErrors && (
                <div className="border-t border-border/30 px-3 pb-3 pt-2 space-y-1">
                  {result.errors.map((e) => (
                    <div key={e.row} className="text-[11px] text-muted-foreground">
                      Row {e.row}: {e.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Done button */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setResult(null); setFile(null); }}
              className="rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3 inline mr-1" /> Import another file
            </button>
            <button
              onClick={onDone}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              View Observations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Observation Card
// ─────────────────────────────────────────────────────────────

function ObservationCard({ obs }: { obs: Observation }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[obs.type] ?? { label: obs.type, color: "border-border/40 text-muted-foreground", icon: "📋" };

  return (
    <div className="rounded-xl border border-border/40 bg-background/60 backdrop-blur px-4 py-3.5 space-y-2 hover:border-border/70 transition-colors">
      {/* Top row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{obs.recordNumber}</span>
        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", meta.color)}>
          {meta.icon} {meta.label}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_COLOR[obs.status] ?? STATUS_COLOR.DRAFT)}>
          {obs.status}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {new Date(obs.observedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Findings */}
      <div className={cn("text-sm leading-snug", !expanded && "line-clamp-2")}>
        {obs.findings}
      </div>
      {obs.findings.length > 120 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-0.5 text-[10px] text-primary/70 hover:text-primary"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" />Show less</>
            : <><ChevronDown className="h-3 w-3" />Show more</>
          }
        </button>
      )}

      {/* Unsafe detail */}
      {obs.unsafeDetail && (
        <div className="text-xs text-muted-foreground border-l-2 border-amber-400/40 pl-2">
          {obs.unsafeDetail}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {obs.location}
        </span>
        {obs.site && <span>· {obs.site.code}</span>}
        <span>· {obs.reportedBy.name}</span>
        {obs.contractor && <span>· 🏗️ {obs.contractor}</span>}
      </div>
    </div>
  );
}
