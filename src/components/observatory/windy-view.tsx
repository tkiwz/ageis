"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const OVERLAYS = ["rain", "wind", "temp", "clouds", "thunder", "dust"] as const;
type Overlay = (typeof OVERLAYS)[number];
const MODELS = ["ecmwf", "gfs", "iconEu"] as const;

/** Windy's public embed (ECMWF / GFS / ICON) over Oman, to compare with the observatory. */
export function WindyView() {
  const { t, isAr } = useI18n();
  const [overlay, setOverlay] = useState<Overlay>("rain");
  const [model, setModel] = useState<(typeof MODELS)[number]>("ecmwf");
  const src = "https://embed.windy.com/embed2.html?lat=21.5&lon=56.8&detailLat=23.6&detailLon=58.4&zoom=6&level=surface"
    + `&overlay=${overlay}&product=${model}&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates`
    + `&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1&lang=${isAr ? "ar" : "en"}`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
        {OVERLAYS.map((o) => (
          <button key={o} onClick={() => setOverlay(o)} aria-pressed={overlay === o}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
              overlay === o ? "border-primary bg-primary/15 font-semibold text-primary" : "border-border/60 text-muted-foreground hover:bg-accent")}>
            {t(`observatory.windy.${o}`)}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {MODELS.map((m) => (
          <button key={m} onClick={() => setModel(m)} aria-pressed={model === m}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
              model === m ? "border-primary bg-primary/15 font-semibold text-primary" : "border-border/60 text-muted-foreground hover:bg-accent")}>
            {m === "ecmwf" ? "ECMWF" : m === "gfs" ? "GFS" : "ICON"}
          </button>
        ))}
        <span className="ms-auto text-[10px] text-muted-foreground">{t("observatory.windy.note")}</span>
      </div>
      <iframe key={src} src={src} title="Windy" className="min-h-0 w-full flex-1 border-0" loading="lazy" allow="fullscreen" />
    </div>
  );
}
