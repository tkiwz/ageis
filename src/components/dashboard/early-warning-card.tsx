"use client";

import Link from "next/link";
import { CloudFog, CloudLightning, CloudRain, ExternalLink, FileWarning, ShieldCheck, Thermometer, Wind, type LucideIcon } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import type { Hazard } from "@/lib/observatory/warnings";
import type { SiteWarnings } from "@/lib/observatory/site-warnings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Same colours as the observatory map
const LEVEL_COLOR = { 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" } as Record<number, string>;
const HAZARD_ICON: Record<Hazard, LucideIcon> = { RAIN: CloudRain, WIND: Wind, STORM: CloudLightning, HEAT: Thermometer, FOG: CloudFog };

export function EarlyWarningCard() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data, error, loading } = useApi<{ generatedAt: string; sites: SiteWarnings[] }>("/api/early-warnings", { refreshMs: 15 * 60_000 });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">{t("earlyWarning.title")}</CardTitle>
          <CardDescription>{t("earlyWarning.subtitle")}</CardDescription>
        </div>
        <Link href="/observatory" className="flex items-center gap-1 text-xs text-primary hover:underline">
          {t("earlyWarning.openObservatory")} <ExternalLink className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : error && !data ? (
          <p className="text-sm text-danger">{t("earlyWarning.failed")}</p>
        ) : !data?.sites.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" /> {t("earlyWarning.none")}
          </p>
        ) : (
          data.sites.map((s) => (
            <div key={s.site.id} className="rounded-lg border border-border/60 p-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold">{isAr && s.site.nameAr ? s.site.nameAr : s.site.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.site.code}</span>
                <span className="text-xs text-muted-foreground">· {isAr ? s.governorate.nameAr : s.governorate.name}</span>
              </div>
              <ul className="space-y-2">
                {s.warnings.map((w, i) => {
                  const Icon = HAZARD_ICON[w.hazard];
                  return (
                    <li key={`${w.hazard}-${w.day}-${i}`} className="flex gap-2.5">
                      <span className="mt-0.5 w-1 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{t(`observatory.hazard.${w.hazard}`)}</span>
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${LEVEL_COLOR[w.level]}33` }}>
                            {t(`observatory.level.${w.level}` as MessageKey)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("observatory.window", { from: f.date(w.from, { weekday: "short", hour: "numeric" }), to: f.date(w.to, { hour: "numeric" }) })}
                          </span>
                        </div>
                        {w.permits.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <FileWarning className="h-3.5 w-3.5 text-warning" />
                            <span className="text-warning">{t("earlyWarning.permits", { n: f.number(w.permits.length) })}</span>
                            <span className="text-muted-foreground">{t("earlyWarning.reviewPermits")}</span>
                            {w.permits.map((p) => (
                              <Link key={p.id} href={`/operations/permits/${p.id}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent" title={`${p.title} · ${f.enum("permitType", p.type)}`}>
                                {p.permitNumber}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
