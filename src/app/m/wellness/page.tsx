"use client";

import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, Loader2, Thermometer, Wind, type LucideIcon } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TONE_EDGE, toneFor } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

interface WellnessAlert {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  messageAr: string | null;
  recommendedAction: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  HEAT_STRESS: Thermometer,
  H2S_EXPOSURE: Wind,
  CO_EXPOSURE: Wind,
  ELEVATED_HR: HeartPulse,
  FALL: AlertTriangle,
  FATIGUE: Activity,
  ASPHYXIATION: AlertTriangle,
};

/** Types not in the shared enums dictionary live in the mobile namespace. */
const LOCAL_TYPES = new Set(["CO_EXPOSURE", "ASPHYXIATION"]);

export default function MyWellnessPage() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data, error, loading, refresh } = useApi<{ alerts: WellnessAlert[] }>("/api/wellness/alerts?status=OPEN", { refreshMs: 20_000 });
  const [acking, setAcking] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ackError, setAckError] = useState(false);

  const alerts = (data?.alerts ?? []).filter((a) => !done.has(a.id));

  async function ack(id: string) {
    setAcking(id);
    setAckError(false);
    try {
      const res = await fetch("/api/wellness/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "resolve" }),
      });
      if (!res.ok) throw new Error();
      setDone((s) => new Set(s).add(id));
      refresh();
    } catch {
      setAckError(true);
    } finally {
      setAcking(null);
    }
  }

  const typeLabel = (v: string) => (LOCAL_TYPES.has(v) ? t(`mobile.wellness.types.${v}` as MessageKey) : f.enum("wellnessAlert", v));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("mobile.wellness.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("mobile.wellness.description")}</p>
      </div>

      {error && !data && <ErrorState onRetry={refresh} />}
      {ackError && <ErrorState message={t("mobile.wellness.ackFailed")} />}

      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : data && alerts.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={t("mobile.wellness.emptyTitle")} description={t("mobile.wellness.emptyBody")} />
      ) : (
        <>
          {alerts.length > 0 && <p className="font-medium text-warning">{t("mobile.wellness.openCount", { n: alerts.length })}</p>}
          <ul className="space-y-3">
            {alerts.map((a) => {
              const Icon = TYPE_ICON[a.alertType] ?? AlertTriangle;
              return (
                <li key={a.id} className={cn("rounded-2xl border border-s-4 bg-card p-4 shadow-card", TONE_EDGE[toneFor(a.severity)])}>
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold">{typeLabel(a.alertType)}</span>
                        <StatusBadge value={a.severity} group="severity" />
                      </div>
                      <p className="mt-2">{isAr ? a.messageAr || a.message : a.message}</p>
                      {a.recommendedAction && (
                        <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                          <div className="font-medium">{t("mobile.wellness.recommended")}</div>
                          <div className="mt-0.5 text-muted-foreground">{a.recommendedAction}</div>
                        </div>
                      )}
                      <div className="mt-2 text-sm text-muted-foreground">{f.relative(a.createdAt)}</div>
                    </div>
                  </div>
                  <Button size="lg" className="mt-4 h-14 w-full text-base" onClick={() => ack(a.id)} disabled={acking === a.id}>
                    {acking === a.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    {t("mobile.wellness.imOk")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="rounded-2xl bg-muted p-4 text-sm">
        <div className="font-medium">{t("mobile.wellness.monitorTitle")}</div>
        <p className="mt-1 text-muted-foreground">{t("mobile.wellness.monitorBody")}</p>
      </div>
    </div>
  );
}
