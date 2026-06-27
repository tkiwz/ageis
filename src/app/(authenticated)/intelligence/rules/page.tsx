"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Zap, Search, Loader2, CheckCircle2, XCircle,
  ChevronRight, Clock, AlertTriangle, Shield, Activity,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface Rule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  enabled: boolean;
  priority: number;
  condition: unknown;
  action: unknown;
  triggerCount: number;
  lastTriggered: string | null;
}

interface RulesData {
  rules: Rule[];
  stats: { total: number; active: number; triggered: number; autoActions: number };
}

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  SAFETY:        Shield,
  EMERGENCY:     AlertTriangle,
  OPERATIONAL:   Activity,
  COMPLIANCE:    Shield,
  ENVIRONMENTAL: Activity,
};

export default function RulesPage() {
  const { data, loading, refresh } = useApi<RulesData>("/api/intelligence/rules", { refreshMs: 30000 });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function toggleRule(rule: Rule) {
    setToggling(rule.id);
    try {
      await fetch(`/api/intelligence/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      refresh();
    } catch { /* ignore */ }
    setToggling(null);
  }

  const rules = data?.rules ?? [];
  const stats = data?.stats ?? { total: 0, active: 0, triggered: 0, autoActions: 0 };

  const filtered = rules.filter((r) => {
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q)
        || (r.description ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">Rule Engine</h1>
        <p className="text-sm text-muted-foreground">
          Automated rules that trigger actions when conditions are met
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Rules"     value={stats.total}        icon={Zap} />
        <Kpi label="Active"          value={stats.active}       icon={CheckCircle2} tone="success" />
        <Kpi label="Total Triggers"  value={stats.triggered}    icon={Activity}     tone="info" />
        <Kpi label="Auto Actions"    value={stats.autoActions}  icon={Shield}       tone="warning" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ALL">All Categories</option>
          <option value="SAFETY">Safety</option>
          <option value="EMERGENCY">Emergency</option>
          <option value="OPERATIONAL">Operational</option>
          <option value="COMPLIANCE">Compliance</option>
          <option value="ENVIRONMENTAL">Environmental</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No rules found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule) => {
            const Icon = CATEGORY_ICONS[rule.category] ?? Zap;
            const isExpanded = expanded === rule.id;
            return (
              <Card key={rule.id} className={cn("glass", !rule.enabled && "opacity-60")}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 shrink-0">
                      <Icon className={cn("h-4 w-4", rule.enabled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : rule.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{rule.name}</span>
                        <span className="rounded-full border border-border/40 bg-muted/20 px-1.5 py-0.5 text-[9px] uppercase">
                          {rule.category}
                        </span>
                        <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                          P{rule.priority}
                        </span>
                        {rule.enabled ? (
                          <span className="flex items-center gap-1 text-[10px] text-risk-low">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <XCircle className="h-3 w-3" /> Disabled
                          </span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{rule.description}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="num">Triggered {rule.triggerCount} times</span>
                        {rule.lastTriggered && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            Last: {timeAgo(rule.lastTriggered)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleRule(rule)}
                      disabled={toggling === rule.id}
                      className={cn(
                        "shrink-0 relative h-5 w-9 rounded-full transition-all",
                        rule.enabled ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                        rule.enabled ? "left-4" : "left-0.5"
                      )} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/40 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          IF (Condition)
                        </div>
                        <pre className="text-[10px] overflow-auto rounded-md bg-muted/30 p-2 max-h-32">
                          {typeof rule.condition === "string" ? rule.condition : JSON.stringify(rule.condition, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          THEN (Action)
                        </div>
                        <pre className="text-[10px] overflow-auto rounded-md bg-muted/30 p-2 max-h-32">
                          {typeof rule.action === "string" ? rule.action : JSON.stringify(rule.action, null, 2)}
                        </pre>
                      </div>
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

function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof Zap;
  tone?: "success" | "info" | "warning";
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
          tone === "success" && "text-risk-low",
          tone === "info"    && "text-primary",
          tone === "warning" && "text-risk-medium"
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}