"use client";

import { useEffect, useState } from "react";
import { HeartPulse, AlertTriangle, CheckCircle2, Loader2, Thermometer, Wind, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface WellnessAlert {
  id: string;
  alertType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  messageAr: string | null;
  aiReasoning: string | null;
  recommendedAction: string | null;
  acknowledged: boolean;
  createdAt: string;
}

const SEV_RING: Record<string, string> = {
  LOW:      "border-risk-low/40 bg-risk-low/5",
  MEDIUM:   "border-risk-medium/40 bg-risk-medium/5",
  HIGH:     "border-risk-high/40 bg-risk-high/5",
  CRITICAL: "border-destructive/40 bg-destructive/5",
};
const SEV_TEXT: Record<string, string> = {
  LOW:      "text-risk-low",
  MEDIUM:   "text-risk-medium",
  HIGH:     "text-risk-high",
  CRITICAL: "text-destructive",
};

const TYPE_ICON: Record<string, typeof Activity> = {
  HEAT_STRESS:   Thermometer,
  H2S_EXPOSURE:  Wind,
  CO_EXPOSURE:   Wind,
  ELEVATED_HR:   HeartPulse,
  FALL:          AlertTriangle,
  FATIGUE:       Activity,
  ASPHYXIATION:  AlertTriangle,
};

const TYPE_LABEL_AR: Record<string, string> = {
  HEAT_STRESS:   "إجهاد حراري",
  H2S_EXPOSURE:  "تعرّض H2S",
  CO_EXPOSURE:   "تعرّض CO",
  ELEVATED_HR:   "نبض مرتفع",
  FALL:          "سقوط",
  FATIGUE:       "إرهاق",
  ASPHYXIATION:  "نقص أكسجين",
};

export default function MyWellnessPage() {
  const [alerts, setAlerts] = useState<WellnessAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/wellness/alerts?status=OPEN", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setAlerts(j.data.alerts ?? []);
    } catch {
      // swallow — show empty state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 20_000);
    return () => window.clearInterval(i);
  }, []);

  async function ack(id: string) {
    setAcking(id);
    await fetch("/api/wellness/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "resolve" }),
    });
    setAcking(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-6 w-6 text-destructive" />
        <h1 className="font-display text-2xl">My wellness</h1>
      </div>
      <p dir="rtl" className="text-sm text-muted-foreground">صحّتي</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border-2 border-risk-low/40 bg-risk-low/5 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-risk-low" />
          <div className="text-lg font-semibold text-risk-low">You&apos;re all good</div>
          <div dir="rtl" className="mt-1 text-sm text-muted-foreground">لا توجد تنبيهات صحية</div>
          <div className="mt-3 text-xs text-muted-foreground">
            Heart rate · Heat · H2S exposure · all normal
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-risk-medium/40 bg-risk-medium/5 px-3 py-2 text-sm">
            <strong>{alerts.length}</strong> open alert{alerts.length > 1 ? "s" : ""} need your attention.
            <br />
            <span dir="rtl" className="text-xs text-muted-foreground">
              لديك {alerts.length} تنبيه يحتاج انتباهك
            </span>
          </div>

          {alerts.map((a) => {
            const Icon = TYPE_ICON[a.alertType] ?? AlertTriangle;
            return (
              <div key={a.id} className={cn("rounded-xl border-2 p-4", SEV_RING[a.severity])}>
                <div className="flex items-start gap-3">
                  <Icon className={cn("h-6 w-6 shrink-0", SEV_TEXT[a.severity])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-xs font-bold uppercase tracking-wider", SEV_TEXT[a.severity])}>
                        {a.severity}
                      </span>
                      <span className="text-sm font-semibold">
                        {a.alertType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div dir="rtl" className="mt-0.5 text-xs text-muted-foreground">
                      {TYPE_LABEL_AR[a.alertType] ?? a.alertType}
                    </div>

                    <p className="mt-2 text-sm">{a.message}</p>
                    {a.messageAr && (
                      <p dir="rtl" className="mt-1 text-sm text-muted-foreground">{a.messageAr}</p>
                    )}

                    {a.recommendedAction && (
                      <div className="mt-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs">
                        <strong>Recommended:</strong> {a.recommendedAction}
                      </div>
                    )}

                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>

                    <button
                      onClick={() => ack(a.id)}
                      disabled={acking === a.id}
                      className="mt-3 w-full rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {acking === a.id ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : (
                        <span>I&apos;m OK now · أنا بخير</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
        <strong>What we monitor:</strong> Heat stress, H2S/CO exposure, heart rate, falls — from your wearable.
        <br />
        <span dir="rtl" className="text-[11px]">
          نراقب: الإجهاد الحراري، التعرّض للغازات، النبض، السقوط
        </span>
      </div>
    </div>
  );
}
