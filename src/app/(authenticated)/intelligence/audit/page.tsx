"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Brain, AlertTriangle, ClipboardCheck, Eye, Search,
  Loader2, ScrollText, Sparkles, User, Cpu, ChevronRight,
  ChevronDown, Copy, Check, GitBranch, Gauge,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface Decision {
  id: string;
  type: string;
  provider: string;
  modelUsed: string;
  reasoning: string;
  autonomous: boolean;
  requiresHuman: boolean;
  createdAt: string;
  inputData?: unknown;
  outputData?: unknown;
  incident?: { incidentNumber: string; title: string; severity: string } | null;
  alert?: { title: string; type: string } | null;
}

interface AuditData {
  decisions: Decision[];
  stats: {
    total: number;
    today: number;
    autonomous: number;
    requiresHuman: number;
  };
}

// AEGIS Unified Color Palette
const COLORS = {
  primary: "#00D4D8",
  accent: "#F58320",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
};

const TYPE_META: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  INCIDENT_ANALYSIS:       { icon: AlertTriangle,  label: "Incident Analysis",  color: "text-red-400" },
  PERMIT_ANALYSIS:         { icon: ClipboardCheck, label: "Permit Analysis",    color: "text-cyan-400" },
  PI_VISION:               { icon: Eye,            label: "Vision Detection",   color: "text-orange-400" },
  ESP_TELEMETRY:           { icon: Cpu,            label: "ESP Telemetry",      color: "text-amber-400" },
  PIPELINE_LEAK_ANALYSIS:  { icon: GitBranch,      label: "Pipeline Analysis",  color: "text-cyan-400" },
  CHAT:                    { icon: Sparkles,       label: "AI Chat",            color: "text-cyan-400" },
  VOICE_INTENT:            { icon: Sparkles,       label: "Voice Command",      color: "text-purple-400" },
  DAILY_FORECAST:          { icon: Gauge,          label: "Daily Forecast",     color: "text-emerald-400" },
};

export default function AuditLogPage() {
  const { data, loading } = useApi<AuditData>("/api/intelligence/audit?limit=100", { refreshMs: 30000 });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [providerFilter, setProviderFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const decisions = data?.decisions ?? [];
  const stats = data?.stats ?? { total: 0, today: 0, autonomous: 0, requiresHuman: 0 };

  const filtered = decisions.filter((d) => {
    if (typeFilter !== "ALL" && d.type !== typeFilter) return false;
    if (providerFilter !== "ALL" && d.provider !== providerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.reasoning.toLowerCase().includes(q)
        || d.type.toLowerCase().includes(q)
        || (d.incident?.title ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Detect unique types in data for filter dropdown
  const availableTypes = Array.from(new Set(decisions.map(d => d.type)));

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">AI Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every decision made by AEGIS is logged here for full transparency
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Decisions" value={stats.total}         icon={ScrollText} />
        <Kpi label="Today"           value={stats.today}         icon={Sparkles}   tone="primary" />
        <Kpi label="Autonomous"      value={stats.autonomous}    icon={Brain}      tone="primary" />
        <Kpi label="Needs Review"    value={stats.requiresHuman} icon={User}       tone="accent" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reasoning, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ALL">All Types</option>
          {availableTypes.map(t => (
            <option key={t} value={t}>{TYPE_META[t]?.label || t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ALL">All Providers</option>
          <option value="CLAUDE">Claude</option>
          <option value="GEMINI">Gemini</option>
        </select>
      </div>

      {/* Decisions list */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No AI decisions found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const meta = TYPE_META[d.type] ?? { icon: Brain, label: d.type.replace(/_/g, " "), color: "text-cyan-400" };
            const Icon = meta.icon;
            const isExpanded = expanded === d.id;
            return (
              <Card key={d.id} className="border-border/50 bg-card/50 backdrop-blur transition-colors hover:bg-card/70">
                <CardContent className="p-4">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : d.id)}
                  >
                    <div className={cn("mt-0.5 shrink-0 p-1.5 rounded-md bg-background/50", meta.color)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <ProviderBadge provider={d.provider} />
                        {d.autonomous && (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400">
                            🤖 AUTONOMOUS
                          </span>
                        )}
                        {d.requiresHuman && (
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
                            👁 NEEDS REVIEW
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                          {timeAgo(d.createdAt)}
                          {(d.inputData !== undefined || d.outputData !== undefined) && (
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                          )}
                        </span>
                      </div>

                      <p className="text-sm leading-relaxed text-foreground/80">
                        {d.reasoning}
                      </p>

                      {d.incident && (
                        <Link
                          href={`/safety/incidents/${d.incident.incidentNumber}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                        >
                          {d.incident.incidentNumber} — {d.incident.title}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}

                      <div className="mt-1.5 text-[10px] text-muted-foreground/60 font-mono">
                        Model: {d.modelUsed}
                      </div>
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && (d.inputData !== undefined || d.outputData !== undefined) && (
                    <div className="mt-4 pt-4 border-t border-border/40 grid gap-3 lg:grid-cols-2">
                      {d.inputData !== undefined && (
                        <JsonBlock label="Input Data" data={d.inputData} accent="cyan" />
                      )}
                      {d.outputData !== undefined && (
                        <JsonBlock label="Output Data" data={d.outputData} accent="orange" />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ Helpers ============

function ProviderBadge({ provider }: { provider: string }) {
  const styles: Record<string, string> = {
    CLAUDE: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
    GEMINI: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  };
  return (
    <span className={cn(
      "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      styles[provider] ?? "border-border text-muted-foreground"
    )}>
      {provider}
    </span>
  );
}

function Kpi({ label, value, icon: Icon, tone }: {
  label: string;
  value: number;
  icon: typeof Brain;
  tone?: "primary" | "accent";
}) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={cn(
          "mt-1.5 font-display text-2xl font-bold",
          tone === "primary" && "text-cyan-400",
          tone === "accent" && "text-orange-400",
          !tone && "text-foreground"
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ JSON Block — formats raw JSON beautifully ============

function JsonBlock({ label, data, accent }: {
  label: string;
  data: unknown;
  accent: "cyan" | "orange";
}) {
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const { formatted, summary, isString } = useFormattedJson(data);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const accentClass = accent === "cyan"
    ? "text-cyan-400 border-cyan-500/20"
    : "text-orange-400 border-orange-500/20";

  return (
    <div className={cn("rounded-md border bg-background/40", accentClass)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className={cn("text-[10px] uppercase tracking-wider font-semibold", accent === "cyan" ? "text-cyan-400" : "text-orange-400")}>
          {label}
        </div>
        <div className="flex items-center gap-2">
          {isString && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFull(!showFull);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showFull ? "Pretty" : "Raw"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-cyan-400" />
                <span className="text-cyan-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="px-3 py-2 text-xs text-foreground/80 border-b border-border/30 bg-background/30">
          <span className="text-muted-foreground">Summary: </span>
          {summary}
        </div>
      )}

      {/* Content */}
      <pre className="text-[11px] leading-relaxed overflow-auto p-3 max-h-72 font-mono text-foreground/85">
        <SyntaxHighlightedJson text={showFull ? (typeof data === "string" ? data : JSON.stringify(data)) : formatted} />
      </pre>
    </div>
  );
}

/**
 * Parse and format JSON data. Handles strings, objects, nested JSON strings.
 */
function useFormattedJson(data: unknown): { formatted: string; summary: string | null; isString: boolean } {
  let parsed: unknown = data;
  let isString = false;

  // If data is a string, try to parse as JSON
  if (typeof data === "string") {
    isString = true;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON, keep as string
      return { formatted: data, summary: null, isString: true };
    }
  }

  // Pretty-print
  const formatted = JSON.stringify(parsed, null, 2);

  // Build smart summary
  let summary: string | null = null;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const keys = Object.keys(obj);

    // Special-case common keys
    if (obj.pipelineId) summary = `Pipeline ${obj.pipelineId}`;
    else if (obj.leakDetected !== undefined) {
      const conf = typeof obj.confidence === "number" ? ` (${(obj.confidence * 100).toFixed(0)}%)` : "";
      summary = `${obj.leakDetected ? "✓ Leak detected" : "✗ No leak"}${conf}${obj.severity ? ` · ${obj.severity}` : ""}`;
    }
    else if (obj.incidentId) summary = `Incident ${obj.incidentId}`;
    else if (obj.permitId) summary = `Permit ${obj.permitId}`;
    else summary = `${keys.length} field${keys.length !== 1 ? "s" : ""}: ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`;
  } else if (Array.isArray(parsed)) {
    summary = `Array of ${parsed.length} item${parsed.length !== 1 ? "s" : ""}`;
  }

  return { formatted, summary, isString };
}

/**
 * Render JSON with syntax highlighting
 */
function SyntaxHighlightedJson({ text }: { text: string }) {
  // Match JSON tokens: strings, numbers, booleans, null, keys
  const tokens = text.split(/(".*?"(?:\s*:)?|\b(?:true|false|null)\b|\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b)/g);

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;

        // Key (ends with : after a string)
        if (/^".*?"\s*:$/.test(token)) {
          return <span key={i} className="text-cyan-300">{token}</span>;
        }
        // String value
        if (/^".*?"$/.test(token)) {
          return <span key={i} className="text-amber-300/90">{token}</span>;
        }
        // Boolean / null
        if (/^(true|false|null)$/.test(token)) {
          return <span key={i} className="text-orange-400">{token}</span>;
        }
        // Number
        if (/^-?\d+\.?\d*(?:[eE][+-]?\d+)?$/.test(token)) {
          return <span key={i} className="text-emerald-300/90">{token}</span>;
        }
        // Punctuation / whitespace
        return <span key={i} className="text-foreground/70">{token}</span>;
      })}
    </>
  );
}