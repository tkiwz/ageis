"use client";

import { CloudRain, History, Tornado, Wind } from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import historyJson from "@/lib/observatory/history.json";

interface Place { name: string; nameAr: string; days: string[]; rain: number[]; gust: number[]; rainLevel: number; windLevel: number }
interface Event {
  id: string; name: string; nameAr: string; kind: "cyclone" | "flood"; storm: string | null; year: number;
  start: string; end: string; places: Place[];
}
const EVENTS = (historyJson as unknown as { events: Event[] }).events.slice().sort((a, b) => b.start.localeCompare(a.start));
const LEVEL_COLOR: Record<number, string> = { 0: "hsl(var(--muted-foreground) / 0.4)", 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" };

/** Past disasters in Oman: recorded rain day by day, strongest gusts, and how our warning thresholds would have rated them. */
export function HistoryView({ onReplay }: { onReplay: (storm: string, year: number) => void }) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const red = EVENTS.filter((e) => e.places.some((p) => Math.max(p.rainLevel, p.windLevel) === 3)).length;
  const day = (d: string, o: Intl.DateTimeFormatOptions) => f.date(`${d}T08:00:00Z`, o);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        <header>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5 text-primary" />{t("observatory.hist.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("observatory.hist.desc")}</p>
          <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">
            {t("observatory.hist.score", { n: f.number(red), total: f.number(EVENTS.length) })}
          </p>
        </header>
        <ol className="relative space-y-4 border-s border-border/70 ps-5">
          {EVENTS.map((e) => {
            const Icon = e.kind === "cyclone" ? Tornado : CloudRain;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -start-[1.72rem] top-3 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </span>
                <article className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-base font-semibold">{isAr ? e.nameAr : e.name}</h2>
                    <span className="text-xs text-muted-foreground">
                      {day(e.start, { day: "numeric", month: "long", year: "numeric" })} – {day(e.end, { day: "numeric", month: "long" })}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t(e.kind === "cyclone" ? "observatory.hist.cyclone" : "observatory.hist.flood")}</span>
                    {e.storm && (
                      <button onClick={() => onReplay(e.storm!, e.year)} className="ms-auto text-xs text-primary hover:underline">{t("observatory.hist.replay")}</button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {e.places.map((p) => {
                      const peak = Math.max(...p.rain, 1);
                      return (
                        <div key={p.name} className="rounded-xl border border-border/50 p-3">
                          <div className="mb-2 text-sm font-medium">{isAr ? p.nameAr : p.name}</div>
                          {/* Rain per day as bars (the tallest is that event's wettest day) */}
                          <div className="flex h-20 items-end gap-1" dir="ltr" aria-hidden>
                            {p.rain.map((mm, k) => (
                              <div key={k} className="flex flex-1 flex-col items-center gap-0.5">
                                <span className="text-[9px] tabular-nums text-muted-foreground">{mm >= 1 ? Math.round(mm) : ""}</span>
                                <div className="w-full rounded-t bg-info/70" style={{ height: `${Math.max(2, (mm / peak) * 52)}px` }} />
                                <span className="text-[9px] text-muted-foreground">{day(p.days[k], { day: "numeric" })}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1"><CloudRain className="h-3 w-3" />{t("observatory.hist.rainMax", { v: f.number(Math.round(Math.max(...p.rain))) })}</div>
                            <div className="flex items-center gap-1"><Wind className="h-3 w-3" />{t("observatory.hist.gustMax", { v: f.number(Math.max(...p.gust)) })}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            {([["ourRain", p.rainLevel], ["ourWind", p.windLevel]] as const).map(([k, lv]) => (
                              <span key={k} className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[lv] }} />
                                {t(`observatory.hist.${k}`)}: {t(`observatory.level.${lv}` as MessageKey)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
