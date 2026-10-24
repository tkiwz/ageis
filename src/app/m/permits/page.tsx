"use client";

import { AlertTriangle, Clock, FileCheck2, MapPin } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

interface Permit {
  id: string;
  permitNumber: string;
  title: string;
  type: string;
  riskLevel: string;
  location: string;
  validUntil: string;
  site?: { code: string; name: string; nameAr?: string | null };
}

const SOON_MS = 60 * 60 * 1000;

export default function MyPermitsPage() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data, error, loading, refresh } = useApi<{ permits: Permit[] }>("/api/permits?mine=1&status=ACTIVE", { refreshMs: 60_000 });
  const permits = data?.permits ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("mobile.permits.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("mobile.permits.description")}</p>
      </div>

      {error && !data && <ErrorState onRetry={refresh} />}

      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : data && permits.length === 0 ? (
        <EmptyState icon={FileCheck2} title={t("mobile.permits.emptyTitle")} description={t("mobile.permits.emptyBody")} />
      ) : (
        <ul className="space-y-3">
          {permits.map((p) => {
            const left = new Date(p.validUntil).getTime() - Date.now();
            const expired = left <= 0;
            const soon = !expired && left < SOON_MS;
            return (
              <li key={p.id} className={cn("rounded-2xl border bg-card p-4 shadow-card", (expired || soon) && "border-s-4", expired ? "border-s-danger" : soon && "border-s-warning")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <bdi className="font-mono text-sm text-muted-foreground" dir="ltr">{p.permitNumber}</bdi>
                    <div className="mt-0.5 text-lg font-semibold leading-snug">{p.title}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{f.enum("permitType", p.type)}</div>
                  </div>
                  <StatusBadge value={p.riskLevel} group="severity" className="shrink-0 text-sm" />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {p.site ? (isAr ? p.site.nameAr || p.site.name : p.site.name) : p.location}
                  </span>
                  <span className={cn("flex items-center gap-1.5", expired ? "text-danger" : soon && "text-warning")}>
                    <Clock className="h-4 w-4" />
                    {expired ? t("mobile.permits.ended", { time: f.relative(p.validUntil) }) : t("mobile.permits.endsIn", { time: f.relative(p.validUntil) })}
                  </span>
                </div>
                {(expired || soon) && (
                  <p className={cn("mt-3 flex gap-2 rounded-xl p-3 text-sm font-medium", expired ? "bg-danger/10 text-danger" : "bg-warning/15 text-warning")}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {expired ? t("mobile.permits.expired") : t("mobile.permits.expiringSoon")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
