"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellRing, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

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

const STATUS_STYLES: Record<string, string> = {
  PENDING:      "border-risk-medium/40 text-risk-medium",
  SENT:         "border-primary/40 text-primary",
  ACKNOWLEDGED: "border-risk-low/40 text-risk-low",
  FAILED:       "border-destructive/40 text-destructive",
};

export function AlertsClient() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/alerts?limit=100", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        // Backend shape: { alerts: [...], summary: {...} }
        // Also tolerate older shape that returned an array directly.
        const list: Alert[] = Array.isArray(j.data) ? j.data : (j.data?.alerts ?? []);
        setAlerts(list);
      }
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 15_000);
    return () => window.clearInterval(i);
  }, []);

  const filtered = filter === "ALL" ? alerts : alerts.filter((a) => a.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {["ALL", "PENDING", "SENT", "ACKNOWLEDGED"].map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {loading && alerts.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No alerts.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const channels = (() => {
              if (!a.channels) return [];
              if (Array.isArray(a.channels)) return a.channels as string[];
              try {
                const parsed = JSON.parse(a.channels);
                return Array.isArray(parsed) ? (parsed as string[]) : [String(a.channels)];
              } catch {
                // Legacy rows store comma-separated values
                return String(a.channels).split(",").map((s) => s.trim()).filter(Boolean);
              }
            })();
            const Icon = a.acknowledgedAt ? Bell : BellRing;
            return (
              <Card key={a.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className={cn("h-5 w-5 mt-0.5", a.acknowledgedAt ? "text-muted-foreground" : "text-primary")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.title}</span>
                        <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                        <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[a.status])}>{a.status}</Badge>
                        {a.isAutonomous && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">AUTO</Badge>}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{a.message}</div>
                      {channels.length > 0 && (
                        <div className="mt-2 flex gap-1">
                          {channels.map((c) => (
                            <Badge key={c} variant="outline" className="text-[9px] font-mono">{c}</Badge>
                          ))}
                        </div>
                      )}
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
