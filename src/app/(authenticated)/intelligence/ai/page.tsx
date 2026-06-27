"use client";

import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain, TrendingUp, AlertTriangle, Shield, Sparkles,
  Loader2, ChevronRight, Activity, MapPin,
} from "lucide-react";
import { cn, riskColor, timeAgo } from "@/lib/utils";

interface PredictionsData {
  totalAIAnalyses: number;
  totalDecisions: number;
  autonomous: number;
  providerStats: Record<string, number>;
  typeStats: Record<string, number>;
  criticalSites: Array<{
    id: string;
    code: string;
    name: string;
    riskLevel: string;
    activeIncidents: number;
  }>;
  predictions: Array<{
    id: string;
    incidentNumber: string;
    title: string;
    siteName: string;
    riskLevel: string;
    summary: string;
    predictions: string[];
    occurredAt: string;
  }>;
}

export default function AIPredictionsPage() {
  const { data, loading } = useApi<PredictionsData>("/api/intelligence/predictions", { refreshMs: 30000 });

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
        No AI data available yet.
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">AI Predictions & Insights</h1>
        <p className="text-sm text-muted-foreground">
          Real-time intelligence from AEGIS analyzing HSSE operations
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="AI Analyses"      value={data.totalAIAnalyses} icon={Brain}      tone="info" />
        <Kpi label="Total Decisions"  value={data.totalDecisions}  icon={Sparkles} />
        <Kpi label="Autonomous"       value={data.autonomous}      icon={Activity}   tone="success" />
        <Kpi label="Active Sites"     value={data.criticalSites.length} icon={MapPin} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Predictions Feed */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            What AI Predicts Could Happen
          </h2>

          {data.predictions.length === 0 ? (
            <Card className="glass">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No predictions yet. Run AI analysis on incidents to generate predictions.
              </CardContent>
            </Card>
          ) : (
            data.predictions.map((p) => (
              <Card key={p.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num text-[10px] text-muted-foreground">{p.incidentNumber}</span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          riskColor(p.riskLevel)
                        )}>
                          {p.riskLevel}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-medium">{p.title}</h3>
                      <p className="text-[11px] text-muted-foreground">{p.siteName} · {timeAgo(p.occurredAt)}</p>
                    </div>
                    <Link href={`/safety/incidents/${p.id}`}
                      className="text-muted-foreground hover:text-foreground shrink-0">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>

                  {p.summary && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{p.summary}</p>
                  )}

                  <div className="mt-3 space-y-1.5">
                    {p.predictions.map((pred, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md border border-risk-high/30 bg-risk-high/5 p-2">
                        <TrendingUp className="h-3 w-3 shrink-0 mt-0.5 text-risk-high" />
                        <span className="text-[11px] leading-relaxed">{pred}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Critical Sites */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-risk-critical" />
                Sites Requiring Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.criticalSites.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  All sites operating normally
                </div>
              ) : (
                <div className="space-y-2">
                  {data.criticalSites.map((s) => (
                    <Link key={s.id} href={`/operations/sites/${s.id}`}
                      className="block rounded-md border border-border/40 p-2 hover:bg-muted/20 transition">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{s.name}</span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                          riskColor(s.riskLevel)
                        )}>
                          {s.riskLevel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="num">{s.code}</span>
                        {s.activeIncidents > 0 && (
                          <span className="text-risk-critical">• {s.activeIncidents} active incidents</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Activity */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Provider Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(data.providerStats).map(([provider, count]) => {
                  const max = Math.max(...Object.values(data.providerStats));
                  const pct = (count / max) * 100;
                  return (
                    <div key={provider}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{provider}</span>
                        <span className="num text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            provider === "CLAUDE" ? "bg-primary" : "bg-orange-500"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Decision Types */}
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                Decision Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {Object.entries(data.typeStats).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <span>{type.replace(/_/g, " ")}</span>
                    <span className="num font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof Brain;
  tone?: "info" | "success" | "warning";
}) {
  return (
    <Card className="glass">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={cn(
          "mt-1 font-display text-2xl num",
          tone === "info"    && "text-primary",
          tone === "success" && "text-risk-low",
          tone === "warning" && "text-risk-medium"
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}