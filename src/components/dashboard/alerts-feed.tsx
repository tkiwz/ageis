"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Bell, Siren, Info } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface Alert {
  id: string;
  type: "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY";
  title: string;
  message: string;
  channels: string;
  status: string;
  isAutonomous: boolean;
  createdAt: string;
  site?: { code: string; name: string } | null;
}

interface AlertsResponse {
  alerts: Alert[];
  summary: { total: number; byType: Record<string, number>; autonomous: number };
}

const typeConfig = {
  INFO:      { icon: Info,           color: "text-foreground/70",   bg: "border-border/40" },
  WARNING:   { icon: Bell,           color: "text-risk-medium",     bg: "border-risk-medium/40 bg-risk-medium/5" },
  CRITICAL:  { icon: AlertTriangle,  color: "text-risk-high",       bg: "border-risk-high/40 bg-risk-high/5" },
  EMERGENCY: { icon: Siren,          color: "text-risk-critical",   bg: "border-risk-critical/40 bg-risk-critical/10 glow-critical" },
};

export function AlertsFeed() {
  const { data, loading } = useApi<AlertsResponse>("/api/alerts?limit=20", { refreshMs: 15000 });

  return (
    <Card className="glass flex h-[480px] flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Live Alerts Feed
          </CardTitle>
          {data && (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {data.summary.total} total · {data.summary.autonomous} autonomous
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-1.5 p-4 pt-0">
            {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading alerts...</div>}
            {!loading && data?.alerts.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No alerts</div>}
            {data?.alerts.map((alert) => {
              const cfg = typeConfig[alert.type] ?? typeConfig.INFO;
              const Icon = cfg.icon;
              return (
                <div key={alert.id} className={cn("rounded-md border p-3", cfg.bg)}>
                  <div className="flex items-start gap-3">
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("text-xs font-semibold uppercase tracking-wider", cfg.color)}>{alert.type}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(alert.createdAt)}</span>
                      </div>
                      <div className="mt-1 text-sm font-medium leading-tight">{alert.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{alert.message}</div>
                      {alert.site && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          📍 {alert.site.name}
                          {alert.isAutonomous && <span className="ml-1 rounded bg-primary/10 px-1.5 text-primary">AUTO</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
