"use client";

import { useState } from "react";
import { Activity, CloudFog, CloudLightning, Haze, LifeBuoy, Phone, Thermometer, Tornado, Waves, Droplets, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { GUIDES, type GuideId } from "./guidance";

const ICON: Record<GuideId, LucideIcon> = {
  wadis: Droplets, storms: CloudLightning, cyclones: Tornado, dust: Haze, heat: Thermometer, fog: CloudFog, quakes: Activity, sea: Waves,
};

/** What to do before, during and after each hazard, with the emergency number. */
export function GuidanceView() {
  const { t, isAr } = useI18n();
  const [open, setOpen] = useState<GuideId>("wadis");
  const g = GUIDES.find((x) => x.id === open)!;
  const tx = (v: { en: string; ar: string }) => (isAr ? v.ar : v.en);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><LifeBuoy className="h-5 w-5 text-primary" />{t("observatory.guide.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("observatory.guide.desc")}</p>
          </div>
          <a href="tel:9999" className="flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white">
            <Phone className="h-4 w-4" />{t("observatory.guide.emergency")}
          </a>
        </header>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
          {GUIDES.map((x) => {
            const Icon = ICON[x.id];
            return (
              <button key={x.id} role="tab" aria-selected={open === x.id} onClick={() => setOpen(x.id)}
                className={cn("flex items-center gap-2 rounded-xl border p-3 text-start text-sm transition-colors",
                  open === x.id ? "border-primary/60 bg-primary/10 font-semibold text-primary" : "border-border/60 hover:bg-accent/60")}>
                <Icon className="h-4 w-4 shrink-0" />{tx(x.title)}
              </button>
            );
          })}
        </div>
        <section className="grid gap-3 sm:grid-cols-3">
          {(["before", "during", "after"] as const).map((k) => (
            <div key={k} className={cn("rounded-2xl border p-4", k === "during" ? "border-warning/50 bg-warning/5" : "border-border/60 bg-card")}>
              <h2 className="mb-2 text-sm font-semibold">{t(`observatory.guide.${k}`)}</h2>
              <ul className="space-y-2 text-sm leading-relaxed">
                {g[k].map((item, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{tx(item)}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
