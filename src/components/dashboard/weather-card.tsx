"use client";

import { useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, Sun, CloudSun, Thermometer, Wind, type LucideIcon } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TONE_SOFT, TONE_TEXT, type Tone } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

interface SiteWeather {
  id: string; code: string; name: string; nameAr: string | null;
  temperature: number; feelsLike: number | null; humidity: number;
  windSpeed: number; windDirection: string; condition: string;
  aqi: number; dust: number | null; alert: boolean; recordedAt: string;
}

// Same thresholds as src/lib/weather/open-meteo.ts (kept here so the client bundle stays DB-free)
const HEAT_WARNING_C = 46;
const HEAT_CRITICAL_C = 54;
const DUST_WARNING = 600;
const WIND_WARNING_KMH = 45;
const COLLAPSED = 6;

const ICONS: Record<string, LucideIcon> = {
  CLEAR: Sun, PARTLY_CLOUDY: CloudSun, CLOUDY: Cloud, FOG: CloudFog, DRIZZLE: CloudRain, RAIN: CloudRain, THUNDERSTORM: CloudLightning,
};

function heatTone(feels: number): Tone {
  if (feels >= HEAT_CRITICAL_C) return "danger";
  if (feels >= HEAT_WARNING_C) return "warning";
  if (feels >= 40) return "info";
  return "neutral";
}

export function WeatherCard() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data, error, loading } = useApi<{ source: string; sites: SiteWeather[] }>("/api/weather", { refreshMs: 5 * 60_000 });
  const [expanded, setExpanded] = useState(false);

  const sites = [...(data?.sites ?? [])].sort((a, b) => (b.feelsLike ?? b.temperature) - (a.feelsLike ?? a.temperature));
  const shown = expanded ? sites : sites.slice(0, COLLAPSED);
  const newest = sites.reduce<string | null>((m, s) => (!m || s.recordedAt > m ? s.recordedAt : m), null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Thermometer className="h-4 w-4" /> {t("weather.title")}</CardTitle>
          <CardDescription>{t("weather.subtitle")}</CardDescription>
        </div>
        {newest && <span className="text-xs text-muted-foreground">{t("common.updatedAgo", { time: f.relative(newest) })}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
        ) : error && !data ? (
          <p className="text-sm text-danger">{t("weather.failed")}</p>
        ) : sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("weather.none")}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((s) => {
                const feels = s.feelsLike ?? s.temperature;
                const tone = heatTone(feels);
                const dusty = (s.dust ?? 0) >= DUST_WARNING || s.windSpeed >= WIND_WARNING_KMH;
                const Icon = ICONS[s.condition] ?? Cloud;
                return (
                  <div key={s.id} className={cn("rounded-lg border p-3", tone === "danger" ? "border-danger/40" : tone === "warning" ? "border-warning/40" : "border-border/60")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{isAr && s.nameAr ? s.nameAr : s.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{s.code}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-label={f.enum("weatherCondition", s.condition)} />
                        <span className={cn("text-xl font-semibold tabular-nums", tone !== "neutral" && TONE_TEXT[tone])}>
                          {Math.round(s.temperature)}°
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {s.feelsLike != null && <span>{t("weather.feelsLike", { t: Math.round(s.feelsLike) })}</span>}
                      <span>{t("weather.humidity", { n: Math.round(s.humidity) })}</span>
                      <span className="flex items-center gap-0.5"><Wind className="h-3 w-3" />{t("weather.wind", { n: Math.round(s.windSpeed), dir: s.windDirection })}</span>
                      {s.aqi > 0 && <span>{t("weather.aqi", { n: s.aqi })}</span>}
                    </div>
                    {(tone === "warning" || tone === "danger" || dusty) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(tone === "warning" || tone === "danger") && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TONE_SOFT[tone])}>{t("weather.heat")}</span>}
                        {dusty && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TONE_SOFT.warning)}>{t("weather.dustRisk")}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{t("weather.source", { source: data?.source ?? "" })}</span>
              {sites.length > COLLAPSED && (
                <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? t("weather.showLess") : t("weather.showAll", { n: sites.length })}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
