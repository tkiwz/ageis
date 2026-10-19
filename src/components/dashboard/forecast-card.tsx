"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, MapPin, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { formatDate, type MessageKey } from "@/lib/i18n/translate";

interface ForecastFactor { factor: string; factorAr: string; weight: "LOW" | "MEDIUM" | "HIGH" }
interface SiteAtRisk { siteCode: string; siteName: string; risk: string; reason: string }

interface Forecast {
  generatedAt: string;
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  headline: string;
  headlineAr: string;
  riskFactors: ForecastFactor[];
  recommendations: string[];
  recommendationsAr: string[];
  sitesAtRisk: SiteAtRisk[];
  confidence: number;
  fromCache: boolean;
  source?: string;
}

const RISK_STYLE: Record<string, { badge: string; border: string; bg: string; text: string }> = {
  LOW:      { badge: "border-risk-low/40 bg-risk-low/10 text-risk-low",                border: "border-risk-low/20",      bg: "bg-risk-low/5",      text: "text-risk-low"      },
  MEDIUM:   { badge: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium",       border: "border-risk-medium/20",   bg: "bg-risk-medium/5",   text: "text-risk-medium"   },
  HIGH:     { badge: "border-risk-high/40 bg-risk-high/10 text-risk-high",             border: "border-risk-high/20",     bg: "bg-risk-high/5",     text: "text-risk-high"     },
  CRITICAL: { badge: "border-risk-critical/40 bg-risk-critical/10 text-risk-critical", border: "border-risk-critical/20", bg: "bg-risk-critical/5", text: "text-risk-critical" },
};

const WEIGHT_STYLE: Record<string, string> = {
  LOW:    "border-risk-low/30 bg-risk-low/10 text-risk-low",
  MEDIUM: "border-risk-medium/30 bg-risk-medium/10 text-risk-medium",
  HIGH:   "border-risk-critical/30 bg-risk-critical/10 text-risk-critical",
};

export function ForecastCard() {
  const { t, locale, isAr } = useI18n();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [pending,  startTransition] = useTransition();

  function load(force: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const res  = await fetch("/api/forecast/daily", { method: force ? "POST" : "GET" });
        const json = await res.json();
        if (json.ok && json.data && !("blocked" in json.data)) {
          setForecast(json.data as Forecast);
        } else {
          setError(t("forecast.unavailable"));
        }
      } catch {
        setError(t("forecast.connectionError"));
      }
    });
  }

  useEffect(() => { load(false); }, []);

  // ── Loading skeleton ────────────────────────────────────────
  if (!forecast && !error && pending) {
    return (
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            {t("forecast.title")}
          </CardTitle>
          <CardDescription>{t("forecast.generating")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 animate-pulse">
            <div className="h-4 w-3/4 rounded bg-muted/30" />
            <div className="h-4 w-1/2 rounded bg-muted/20" />
            <div className="mt-4 flex gap-2">
              <div className="h-6 w-20 rounded bg-muted/20" />
              <div className="h-6 w-24 rounded bg-muted/20" />
              <div className="h-6 w-16 rounded bg-muted/20" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error / first load ──────────────────────────────────────
  if (!forecast) {
    return (
      <Card className="glass border-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            {t("forecast.title")}
          </CardTitle>
          {error && <CardDescription className="text-risk-medium">{error}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={pending}>
            <RefreshCw className={`h-3.5 w-3.5 me-1.5 ${pending ? "animate-spin" : ""}`} />
            {pending ? t("common.loading") : t("forecast.load")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const style = RISK_STYLE[forecast.overallRisk] ?? RISK_STYLE.LOW;

  return (
    <Card className={`glass border ${style.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("forecast.title")}
            </CardTitle>
            <CardDescription className="mt-1 text-[11px]">
              {forecast.source === "rule-based" ? t("forecast.ruleBased") : forecast.fromCache ? t("forecast.cachedAi") : t("forecast.ai")}
              {" · "}
              {formatDate(forecast.generatedAt, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {t("forecast.confidence", { n: (forecast.confidence * 100).toFixed(0) })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`${style.badge} font-bold text-[10px] px-2.5 py-0.5`}>
              {t(`level.${forecast.overallRisk}`)}
            </Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => load(true)} disabled={pending} title={t("common.refresh")}>
              <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Headline */}
        <div className={`rounded-lg border px-4 py-3 ${style.border} ${style.bg}`}>
          <p className={`text-sm font-medium ${style.text}`}>{isAr ? forecast.headlineAr || forecast.headline : forecast.headline}</p>
        </div>

        {/* Risk Factors */}
        {forecast.riskFactors?.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">
              {t("forecast.riskFactors")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {forecast.riskFactors.map((f, i) => (
                <span key={i} className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${WEIGHT_STYLE[f.weight] ?? WEIGHT_STYLE.LOW}`}>
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {isAr ? f.factorAr || f.factor : f.factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sites at Risk */}
        {forecast.sitesAtRisk?.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">
              {t("forecast.sitesAtRisk")}
            </p>
            <div className="space-y-1.5">
              {forecast.sitesAtRisk.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border/30 bg-muted/10 px-3 py-2 text-xs">
                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono font-medium" dir="ltr">{s.siteCode}</span>
                  <span className="text-muted-foreground flex-1">{s.reason}</span>
                  <Badge variant="outline" className={`${RISK_STYLE[s.risk]?.badge ?? ""} text-[9px] px-1.5 py-0`}>
                    {t(`level.${s.risk}` as MessageKey)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {forecast.recommendations?.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold text-muted-foreground/70">
              {t("forecast.recommendations")}
            </p>
            <ul className="space-y-1.5">
              {(isAr && forecast.recommendationsAr?.length ? forecast.recommendationsAr : forecast.recommendations).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 text-primary shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trend indicator */}
        <div className="flex items-center justify-between border-t border-border/20 pt-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
            <TrendingUp className="h-3 w-3" />
            <span>{t("forecast.updatesEvery")}</span>
          </div>
          <button onClick={() => load(true)} disabled={pending}
            className="text-[10px] text-primary hover:underline disabled:opacity-50">
            {pending ? t("forecast.refreshing") : t("forecast.refreshNow")}
          </button>
        </div>

      </CardContent>
    </Card>
  );
}
