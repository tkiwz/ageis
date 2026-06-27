"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Detection {
  id: string;
  label: string;
  confidence: number;
  status: string;
  aiAnalyzed: boolean;
  aiSeverity: string | null;
  aiReasoning: string | null;
  imageUrl: string | null;
  detectedAt: string;
  device: { code: string; name: string; type: string };
}

const STATUS: Record<string, string> = {
  OK:       "border-risk-low/40 text-risk-low",
  INFO:     "border-primary/40 text-primary",
  WARNING:  "border-risk-medium/40 text-risk-medium",
  CRITICAL: "border-destructive/40 text-destructive",
};

export default function PPEMonitorPage() {
  const [items, setItems] = useState<Detection[]>([]);
  const [kpis, setKpis] = useState({ todayTotal: 0, todayViolations: 0 });
  const [filter, setFilter] = useState<"ALL" | "WARNING" | "CRITICAL" | "OK">("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: "60" });
    if (filter !== "ALL") params.set("status", filter);
    const r = await fetch(`/api/vision-detections?${params}`);
    const j = await r.json();
    if (j.ok) {
      setItems(j.data.detections ?? []);
      setKpis(j.data.kpis ?? { todayTotal: 0, todayViolations: 0 });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 10_000);
    return () => window.clearInterval(i);
  }, [filter]);

  const complianceRate = kpis.todayTotal === 0
    ? 100
    : Math.round(((kpis.todayTotal - kpis.todayViolations) / kpis.todayTotal) * 100);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
          <Camera className="h-7 w-7 text-primary" /> PPE Monitor
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time PPE compliance detection from Pi Vision cameras (helmet, vest, gloves).
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">مراقبة معدات الحماية</span>
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Detections today" value={kpis.todayTotal} tone="info" />
        <Kpi label="Violations today" value={kpis.todayViolations} tone="critical" />
        <Kpi label="Compliance rate" value={`${complianceRate}%`} tone={complianceRate >= 95 ? "success" : "warning"} />
      </div>

      <div className="mb-4 flex gap-2">
        {(["ALL", "OK", "WARNING", "CRITICAL"] as const).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>{f}</Button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No detections.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => {
            const isOk = d.status === "OK";
            return (
              <Card key={d.id} className={cn("glass", !isOk && STATUS[d.status])}>
                <CardContent className="p-3">
                  {d.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.imageUrl} alt={d.label} className="mb-2 aspect-video w-full rounded-md border border-border/40 object-cover" />
                  ) : (
                    <div className="mb-2 aspect-video w-full rounded-md border border-dashed border-border/40 bg-muted/20 flex items-center justify-center">
                      {isOk ? (
                        <CheckCircle2 className="h-8 w-8 text-risk-low/50" />
                      ) : (
                        <AlertTriangle className="h-8 w-8 text-risk-medium/50" />
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{d.label.replace(/_/g, " ")}</span>
                    <Badge variant="outline" className={cn("text-[10px]", STATUS[d.status])}>{d.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(d.confidence * 100).toFixed(0)}% · {d.device.code}
                  </div>
                  {d.aiReasoning && (
                    <div className="mt-2 rounded-md border border-border/40 bg-background/40 px-2 py-1 text-[11px]">
                      {d.aiReasoning}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">{new Date(d.detectedAt).toLocaleTimeString()}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: {
  label: string;
  value: number | string;
  tone: "info" | "success" | "warning" | "critical";
}) {
  const styles = {
    info: "border-primary/40 text-primary",
    success: "border-risk-low/40 text-risk-low",
    warning: "border-risk-medium/40 text-risk-medium",
    critical: "border-destructive/40 text-destructive",
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
