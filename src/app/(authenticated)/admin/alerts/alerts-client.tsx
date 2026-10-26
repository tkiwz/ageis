"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellRing, Check, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  channels: string;
  status: string;
  isAutonomous: boolean;
  acknowledgedAt?: string | null;
  siteId?: string | null;
  createdAt: string;
  site?: { code: string; name: string } | null;
}

const TYPE_STYLES: Record<string, string> = {
  EMERGENCY:    "border-destructive/40 text-destructive",
  CRITICAL:     "border-destructive/40 text-destructive",
  GAS_CRITICAL: "border-destructive/40 text-destructive",
  FIRE:         "border-destructive/40 text-destructive",
  FLAME:        "border-destructive/40 text-destructive",
  LEAK:         "border-risk-medium/40 text-risk-medium",
  WARNING:      "border-risk-medium/40 text-risk-medium",
  GAS_WARNING:  "border-risk-medium/40 text-risk-medium",
};

type Filter = "OPEN" | "ACKNOWLEDGED" | "ALL";

function parseChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [String(raw)];
  } catch {
    // Legacy rows store comma-separated values
    return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export function AlertsClient() {
  const { t } = useI18n();
  const f = useFormat();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/alerts?limit=100", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error?.message);
      setAlerts(Array.isArray(j.data) ? j.data : (j.data?.alerts ?? []));
      setError(null);
    } catch {
      setError(t("admin.alerts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const i = window.setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => window.clearInterval(i);
  }, [load]);

  async function acknowledge(id: string) {
    setAcking(id);
    try {
      const r = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (j.ok) {
        setAlerts((list) => list.map((a) => (a.id === id ? { ...a, acknowledgedAt: j.data.acknowledgedAt, status: "ACKNOWLEDGED" } : a)));
      }
    } finally {
      setAcking(null);
    }
  }

  const filtered = alerts.filter((a) =>
    filter === "ALL" ? true : filter === "OPEN" ? !a.acknowledgedAt : !!a.acknowledgedAt,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["OPEN", "ACKNOWLEDGED", "ALL"] as Filter[]).map((k) => (
            <Button key={k} variant={filter === k ? "default" : "outline"} size="sm" onClick={() => setFilter(k)}>
              {t(`admin.alerts.filter.${k}`)}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> {t("admin.alerts.refresh")}
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {loading && alerts.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="glass">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filter === "OPEN" && alerts.length > 0 ? t("admin.alerts.noneOpen") : t("admin.alerts.none")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const channels = parseChannels(a.channels);
            const Icon = a.acknowledgedAt ? Bell : BellRing;
            return (
              <Card key={a.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", a.acknowledgedAt ? "text-muted-foreground" : "text-primary")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.title}</span>
                        <Badge variant="outline" className={cn("text-[10px]", TYPE_STYLES[a.type])}>{f.enum("alertType", a.type)}</Badge>
                        {a.site && <Badge variant="outline" className="font-mono text-[10px]">{a.site.code}</Badge>}
                        {a.isAutonomous && <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">{t("admin.alerts.auto")}</Badge>}
                        <span className="ms-auto text-xs text-muted-foreground">{f.dateTime(a.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{a.message}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {channels.map((c) => (
                          <Badge key={c} variant="outline" className="font-mono text-[9px]">{c}</Badge>
                        ))}
                        <span className="ms-auto">
                          {a.acknowledgedAt ? (
                            <span className="text-xs text-risk-low">
                              {t("admin.alerts.acknowledgedAt", { date: f.relative(a.acknowledgedAt) })}
                            </span>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} disabled={acking === a.id}>
                              {acking === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              {t("admin.alerts.acknowledge")}
                            </Button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
