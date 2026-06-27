"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeartPulse, AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface WellnessAlert {
  id: string;
  userId: string;
  alertType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  messageAr?: string | null;
  aiReasoning?: string | null;
  recommendedAction?: string | null;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  worker?: { id: string; name: string; email: string; role: string } | null;
}

const SEV_STYLES: Record<string, string> = {
  LOW: "border-risk-low/40 bg-risk-low/10 text-risk-low",
  MEDIUM: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium",
  HIGH: "border-risk-high/40 bg-risk-high/10 text-risk-high",
  CRITICAL: "border-destructive/50 bg-destructive/10 text-destructive",
};

export default function WellnessPage() {
  const [alerts, setAlerts] = useState<WellnessAlert[]>([]);
  const [filter, setFilter] = useState<"OPEN" | "ACKED" | "ALL">("OPEN");
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const url = filter === "ALL" ? "/api/wellness/alerts" : `/api/wellness/alerts?status=${filter}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        // Tolerate both { alerts: [...] } and [...] shapes
        const list: WellnessAlert[] = Array.isArray(j.data) ? j.data : (j.data?.alerts ?? []);
        setAlerts(list);
      }
    });
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [filter]);

  async function ack(id: string, action: "ack" | "resolve") {
    await fetch("/api/wellness/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    load();
  }

  const counts = {
    open: alerts.filter((a) => !a.acknowledged).length,
    high: alerts.filter((a) => ["HIGH", "CRITICAL"].includes(a.severity) && !a.acknowledged).length,
  };

  return (
    <div className="container mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
            <HeartPulse className="h-7 w-7 text-destructive" /> Worker Wellness
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time wellness from ESP32 wearables — heat, H2S/CO exposure, heart rate, falls.
            <span className="mx-2 opacity-50">·</span>
            <span dir="rtl" className="inline-block">صحة العاملين في الوقت الفعلي</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={pending}>
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Open Alerts" value={counts.open} tone="warning" />
        <KpiCard label="High Severity Open" value={counts.high} tone="critical" />
        <KpiCard label="Total Showing" value={alerts.length} tone="info" />
      </div>

      <div className="mb-4 flex gap-2">
        {(["OPEN", "ACKED", "ALL"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "OPEN" ? "Open" : f === "ACKED" ? "Acknowledged" : "All"}
          </Button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <Card className="glass">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {pending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "No wellness alerts."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className={cn("border", SEV_STYLES[a.severity]?.split(" ")[0])}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={SEV_STYLES[a.severity]}>{a.severity}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">{a.alertType}</Badge>
                  {a.worker && (
                    <span className="text-sm font-semibold">{a.worker.name}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>{a.message}</div>
                {a.messageAr && <div dir="rtl" className="text-muted-foreground">{a.messageAr}</div>}
                {a.aiReasoning && (
                  <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs">
                    <span className="text-primary font-semibold">AI Reasoning:</span>{" "}
                    {a.aiReasoning}
                  </div>
                )}
                {a.recommendedAction && (
                  <div className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-primary" />
                    <span><strong>Recommended:</strong> {a.recommendedAction}</span>
                  </div>
                )}
                {!a.acknowledged && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => ack(a.id, "ack")}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Acknowledge
                    </Button>
                    <Button size="sm" onClick={() => ack(a.id, "resolve")}>
                      Resolve
                    </Button>
                  </div>
                )}
                {a.acknowledged && (
                  <div className="text-xs text-muted-foreground">
                    {a.resolvedAt
                      ? `Resolved ${new Date(a.resolvedAt).toLocaleString()}`
                      : `Acknowledged ${a.acknowledgedAt ? new Date(a.acknowledgedAt).toLocaleString() : ""}`}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, tone }: {
  label: string; value: number; tone: "critical" | "warning" | "info";
}) {
  const styles = {
    critical: "border-destructive/40 text-destructive",
    warning: "border-risk-medium/40 text-risk-medium",
    info: "border-primary/40 text-primary",
  };
  return (
    <Card className={cn("glass border", styles[tone])}>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 font-display text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}
