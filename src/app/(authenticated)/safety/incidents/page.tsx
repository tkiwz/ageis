"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, Brain } from "lucide-react";
import { cn, timeAgo, riskColor } from "@/lib/utils";

interface Incident {
  id: string;
  incidentNumber: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  location: string;
  occurredAt: string;
  aiAnalysis: Record<string, unknown> | null;
  site: { code: string; name: string } | null;
  reporter: { name: string; role: string };
}

interface IncidentsResponse {
  incidents: Incident[];
  summary: { total: number; bySeverity: Record<string, number> };
}

const STATUS_FILTER = ["ALL", "OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"] as const;

export default function IncidentsPage() {
  const [severity, setSeverity] = useState<string>("ALL");
  const [status, setStatus]     = useState<string>("ALL");

  const params = new URLSearchParams({ limit: "50" });
  if (severity !== "ALL") params.set("severity", severity);
  if (status   !== "ALL") params.set("status",   status);

  const { data, loading } = useApi<IncidentsResponse>(
    `/api/incidents?${params}`,
    { refreshMs: 30000 }
  );

  const bySev = data?.summary.bySeverity ?? {};

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-md border border-risk-high/30 bg-risk-high/10 p-3">
          <AlertTriangle className="h-6 w-6 text-risk-high" />
        </div>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.summary.total ?? 0} total · AI-powered root cause analysis
          </p>
        </div>
      </div>

      {/* Severity KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => setSeverity(severity === sev ? "ALL" : sev)}
            className={cn(
              "rounded-md border p-3 text-left transition-all",
              severity === sev ? "ring-2 ring-primary" : "",
              riskColor(sev),
            )}
          >
            <div className="text-[10px] uppercase tracking-widest opacity-80">{sev}</div>
            <div className="num mt-1 text-2xl font-semibold">{bySev[sev] ?? 0}</div>
          </button>
        ))}
      </div>

      {/* Status Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              status === s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/30 text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "ALL" ? "All statuses" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading incidents...
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.incidents.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
      </div>

      {!loading && data?.incidents.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No incidents match the filters.
        </div>
      )}
    </div>
  );
}

function IncidentCard({ inc }: { inc: Incident }) {
  const isAIed = !!inc.aiAnalysis;
  return (
    <Link href={`/safety/incidents/${inc.id}`}>
      <Card className="glass h-full cursor-pointer transition-colors hover:bg-accent/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase",
              riskColor(inc.severity)
            )}>
              {inc.severity}
            </span>
            <span className="num text-[10px] text-muted-foreground">
              {inc.incidentNumber}
            </span>
          </div>

          <div className="mt-2 text-sm font-semibold leading-snug">
            {inc.title}
          </div>

          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div>{inc.type.replace(/_/g, " ")} · {inc.location}</div>
            {inc.site && <div>📍 {inc.site.name}</div>}
            <div>🕒 {timeAgo(inc.occurredAt)}</div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase",
              inc.status === "RESOLVED" || inc.status === "CLOSED"
                ? "border-risk-low/40 bg-risk-low/10 text-risk-low"
                : inc.status === "INVESTIGATING"
                  ? "border-risk-medium/40 bg-risk-medium/10 text-risk-medium"
                  : "border-risk-high/40 bg-risk-high/10 text-risk-high",
            )}>
              {inc.status}
            </span>
            <div className="flex items-center gap-2">
              {isAIed && (
                <span title="AI analyzed">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                </span>
              )}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}