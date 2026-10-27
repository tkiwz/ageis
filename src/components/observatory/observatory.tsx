"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  CalendarDays, Cloud, CloudFog, CloudLightning, CloudRain, Loader2, LocateFixed, Map as MapIcon, Pause, Play, RefreshCw, Share2, ShieldAlert,
  ShieldCheck, Thermometer, Wind, X, type LucideIcon,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import type { ForecastGrid } from "@/lib/observatory/grid";
import type { Hazard, Level, Warning, WarningsResult } from "@/lib/observatory/warnings";
import governorates from "@/lib/observatory/oman-governorates.json";
import { LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BANDS, LEGEND, frameOf, govAt, legendGradient, sample, type GovInfo, type LayerId } from "./field";
import type { MapMode } from "./weather-map";
import { ForecastView } from "./forecast-view";

type Tab = MapMode | "forecast";

const WeatherMap = dynamic(() => import("./weather-map").then((m) => m.WeatherMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

// Same colours as the map fills
const LEVEL_COLOR: Record<Level, string> = { 0: "transparent", 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" };
const LAYERS: { id: LayerId; icon: LucideIcon }[] = [
  { id: "temp", icon: Thermometer }, { id: "rain", icon: CloudRain }, { id: "wind", icon: Wind }, { id: "cloud", icon: Cloud },
];
const HAZARD_ICON: Record<Hazard, LucideIcon> = { RAIN: CloudRain, WIND: Wind, STORM: CloudLightning, HEAT: Thermometer, FOG: CloudFog };
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const GOV_NAMES = Object.fromEntries(
  (governorates as unknown as { features: { properties: { iso: string; name: string; nameAr: string } }[] }).features
    .map((f) => [f.properties.iso, f.properties]),
);
const REFRESH_MS = 30 * 60_000;
const omanDay = (iso: string) => new Date(Date.parse(iso) + 4 * 3600_000).toISOString().slice(0, 10);
const noonOf = (day: string) => `${day}T08:00:00Z`; // 12:00 in Oman

export function Observatory() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { resolvedTheme } = useTheme();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme !== "light" : true;

  const [tab, setTab] = useState<Tab>("layers");
  const mode: MapMode = tab === "warnings" ? "warnings" : "layers";
  const [layer, setLayer] = useState<LayerId>("temp");
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const forecast = useApi<ForecastGrid>("/api/observatory/forecast", { refreshMs: REFRESH_MS });
  const warnings = useApi<WarningsResult>("/api/observatory/warnings", { refreshMs: REFRESH_MS });
  const grid = forecast.data;

  // Steps grouped by Oman day; start on the step closest to now
  const days = useMemo(() => (grid ? [...new Set(grid.times.map(omanDay))] : []), [grid]);
  const nowStep = useMemo(() => {
    if (!grid) return 0;
    const now = Date.now();
    let best = 0;
    grid.times.forEach((ti, k) => { if (Math.abs(Date.parse(ti) - now) < Math.abs(Date.parse(grid.times[best]) - now)) best = k; });
    return best;
  }, [grid]);
  const cur = step ?? nowStep;

  useEffect(() => {
    if (!playing || !grid) return;
    const id = window.setInterval(() => setStep((s) => ((s ?? nowStep) + 1) % grid.times.length), 900);
    return () => window.clearInterval(id);
  }, [playing, grid, nowStep]);

  const levelsForDay = useMemo(() => {
    const out: Record<string, Level> = {};
    if (warnings.data) for (const [iso, lv] of Object.entries(warnings.data.levels)) out[iso] = lv[dayIdx] ?? 0;
    return out;
  }, [warnings.data, dayIdx]);
  const dayWarnings = useMemo(
    () => (warnings.data?.warnings ?? []).filter((w) => w.day === warnings.data?.days[dayIdx]),
    [warnings.data, dayIdx],
  );

  function locate() {
    if (!("geolocation" in navigator)) { setLocMsg(t("observatory.locateDenied")); return; }
    setLocating(true); setLocMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        const gov = govAt(pos.lat, pos.lon);
        if (!gov) { setLocMsg(t("observatory.outsideOman")); return; }
        setMyPos(pos);
        if (mode === "warnings") setSelectedIso(gov.iso);
      },
      () => { setLocating(false); setLocMsg(t("observatory.locateDenied")); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  async function share() {
    const url = `${window.location.origin}/observatory`;
    const today = (warnings.data?.warnings ?? []).filter((w) => w.day === warnings.data?.days[0]);
    const DOT: Record<number, string> = { 3: "🔴", 2: "🟠", 1: "🟡" };
    const groups = new Map<string, { level: Level; hazard: Hazard; places: string[] }>();
    for (const w of today) {
      const k = `${w.level}-${w.hazard}`;
      const g = groups.get(k) ?? { level: w.level, hazard: w.hazard, places: [] };
      g.places.push(isAr ? GOV_NAMES[w.iso]?.nameAr : GOV_NAMES[w.iso]?.name);
      groups.set(k, g);
    }
    const lines = [...groups.values()].sort((a, b) => b.level - a.level).map((g) =>
      `${DOT[g.level]} ${t("observatory.shareIn", { hazard: t(`observatory.hazard.${g.hazard}`), places: g.places.join(isAr ? "، " : ", ") })}`);
    const text = (lines.length ? [t("observatory.shareToday"), ...lines] : [t("observatory.shareNone")])
      .concat("", `${t("observatory.shareFollow")}`).join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: t("observatory.shareTitle"), text, url }); return; } catch { /* cancelled */ return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
  }

  const formatValue = (ly: LayerId, v: number, dirDeg?: number) => {
    const n = ly === "rain" ? (v < 0.1 ? "0" : v.toFixed(1)) : Math.round(v).toString();
    const base = t(`observatory.readout.${ly}` as MessageKey, { v: f.number(Number(n)) });
    if (ly !== "wind" || dirDeg === undefined) return base;
    return `${base} ${ARROWS[Math.round((((dirDeg + 180) % 360) / 45)) % 8]}`;
  };
  const levelLabel = (l: Level) => t(`observatory.level.${l}` as MessageKey);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* ── Header ── */}
      <header className="z-[1100] flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur sm:gap-3 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md outline-offset-4" aria-label={t("observatory.title")}>
          <LogoMark className="h-8 w-8" />
          <div className="hidden leading-tight md:block">
            <div className="text-sm font-semibold">{t("observatory.title")}</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{t("observatory.subtitle")}</div>
          </div>
        </Link>
        <nav className="mx-auto flex rounded-lg bg-muted p-1" aria-label={t("observatory.title")}>
          {(["layers", "warnings", "forecast"] as Tab[]).map((m) => {
            const Icon = m === "layers" ? MapIcon : m === "warnings" ? ShieldAlert : CalendarDays;
            const count = m === "warnings" ? (warnings.data?.warnings.filter((w) => w.day === warnings.data?.days[0]).length ?? 0) : 0;
            return (
              <button
                key={m}
                onClick={() => { setTab(m); setPlaying(false); setSelectedIso(null); }}
                aria-pressed={tab === m}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                  tab === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className={cn(tab !== m && "hidden sm:inline")}>
                  {t(m === "layers" ? "observatory.tabs.map" : m === "warnings" ? "observatory.tabs.warnings" : "observatory.fc.tab")}
                </span>
                {count > 0 && <span className="rounded-full bg-warning/20 px-1.5 text-[10px] font-semibold text-warning tabular-nums">{f.number(count)}</span>}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={share}
          aria-label={t("observatory.share")}
          title={t("observatory.share")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        <LangToggle />
        <ThemeToggle />
        <Link
          href={status === "authenticated" ? "/dashboard" : "/login"}
          className="hidden rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
        >
          {status === "authenticated" ? t("observatory.openAegis") : t("observatory.signIn")}
        </Link>
      </header>

      {/* ── Map area ── */}
      <main className="relative min-h-0 flex-1">
        {tab === "forecast" ? (
          <ForecastView
            warnings={warnings.data?.warnings ?? []}
            myPos={myPos}
            onLocate={locate}
            onShowOnMap={(iso) => { setTab("warnings"); setSelectedIso(iso); }}
          />
        ) : grid ? (
          <WeatherMap
            grid={grid}
            mode={mode}
            layer={layer}
            step={cur}
            dark={dark}
            isAr={isAr}
            levels={levelsForDay}
            selectedIso={selectedIso}
            onSelectIso={setSelectedIso}
            formatValue={formatValue}
            levelLabel={levelLabel}
            myPos={myPos}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            {forecast.error ? (
              <>
                <p>{t("observatory.failed")}</p>
                <Button variant="outline" size="sm" onClick={forecast.refresh}><RefreshCw className="h-4 w-4" />{t("observatory.retry")}</Button>
              </>
            ) : (
              <><Loader2 className="h-5 w-5 animate-spin" />{t("observatory.loading")}</>
            )}
          </div>
        )}

        {grid && tab !== "forecast" && (
          <div
            className={cn(
              "absolute top-3 z-[1000] flex w-64 flex-col items-end gap-2 sm:top-5",
              mode === "warnings" ? "start-3 items-start sm:start-5" : "end-3 sm:end-5",
              mode === "layers" && "top-[4.25rem] sm:top-5",
            )}
          >
            <Button variant="outline" size="sm" className={cn(PANEL, "h-9 gap-1.5")} onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {locating ? t("observatory.locating") : t("observatory.locate")}
            </Button>
            {locMsg && <div className={cn(PANEL, "px-3 py-2 text-xs text-muted-foreground")}>{locMsg}</div>}
            {myPos && mode === "layers" && (
              <MyPlace
                grid={grid}
                step={cur}
                pos={myPos}
                gov={govAt(myPos.lat, myPos.lon)}
                todays={(warnings.data?.warnings ?? []).filter((w) => w.day === omanDay(grid.times[cur]))}
                formatValue={formatValue}
                onClose={() => setMyPos(null)}
              />
            )}
          </div>
        )}

        {grid && tab === "layers" && (
          <>
            <LayerSwitcher layer={layer} onChange={setLayer} />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex flex-col items-start gap-2 sm:inset-x-5 sm:bottom-5">
              <Legend layer={layer} dark={dark} />
              <TimeBar
                times={grid.times} days={days} step={cur} nowStep={nowStep} playing={playing}
                onStep={(s) => { setPlaying(false); setStep(s); }}
                onTogglePlay={() => setPlaying((p) => !p)}
                updatedAt={grid.generatedAt}
              />
            </div>
          </>
        )}

        {tab === "warnings" && warnings.data && (
          <WarningsPanel
            data={warnings.data}
            dayIdx={dayIdx}
            onDay={(d) => { setDayIdx(d); setSelectedIso(null); }}
            items={dayWarnings}
            selectedIso={selectedIso}
            onSelectIso={setSelectedIso}
          />
        )}
      </main>
    </div>
  );
}

/** Compact Arabic ⇄ English switch: "EN" / "ع" keeps the header to one line on phones. */
function LangToggle() {
  const { isAr, setLocale, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(isAr ? "en" : "ar")}
      aria-label={t("layout.language")}
      title={t("layout.switchTo")}
      className="flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {isAr ? "EN" : "ع"}
    </button>
  );
}

/** "Your area": the values now at the viewer's position and today's warnings for their governorate. */
function MyPlace({ grid, step, pos, gov, todays, formatValue, onClose }: {
  grid: ForecastGrid; step: number; pos: { lat: number; lon: number }; gov: GovInfo | null; todays: Warning[];
  formatValue: (l: LayerId, v: number, dir?: number) => string; onClose: () => void;
}) {
  const { t, isAr } = useI18n();
  const temp = frameOf(grid, "temp", step), rain = frameOf(grid, "rain", step);
  const at = (arr: Float32Array) => sample(grid, arr, pos.lat, pos.lon) ?? 0;
  const u = at(temp.u), v = at(temp.v);
  const mine = gov ? todays.filter((w) => w.iso === gov.iso) : [];
  return (
    <div className={cn(PANEL, "w-64 space-y-2 p-3 text-start")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">{t("observatory.myPlace")}</div>
          <div className="text-sm font-semibold">{gov ? (isAr ? gov.nameAr : gov.name) : "—"}</div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label={t("observatory.close")}><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { icon: Thermometer, text: formatValue("temp", at(temp.values)) },
          { icon: CloudRain, text: formatValue("rain", at(rain.values)) },
          { icon: Wind, text: formatValue("wind", Math.hypot(u, v), (Math.atan2(-u, -v) * 180) / Math.PI + 360) },
        ].map(({ icon: Icon, text }, k) => (
          <div key={k} className="rounded-md bg-muted/60 px-1 py-1.5">
            <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
            <div className="mt-0.5 text-xs font-medium tabular-nums">{text}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">{t("observatory.todayHere")}</div>
      {mine.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs"><ShieldCheck className="h-3.5 w-3.5 text-success" />{t("observatory.noWarningsHere")}</div>
      ) : (
        <ul className="space-y-1">
          {mine.map((w, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} />
              <span className="font-medium">{t(`observatory.hazard.${w.hazard}`)}</span>
              <span className="text-muted-foreground">· {t(`observatory.level.${w.level}` as MessageKey)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Floating panels ─────────────────────────────────────── */

const PANEL = "rounded-xl border border-border/60 bg-background/90 shadow-sm backdrop-blur-md";

function LayerSwitcher({ layer, onChange }: { layer: LayerId; onChange: (l: LayerId) => void }) {
  const { t } = useI18n();
  return (
    <div className={cn(PANEL, "absolute start-3 top-3 z-[1000] flex gap-1 p-1 sm:start-5 sm:top-5")} role="radiogroup" aria-label={t("observatory.tabs.map")}>
      {LAYERS.map(({ id, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={layer === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm",
            layer === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          <span>{t(`observatory.layers.${id}`)}</span>
        </button>
      ))}
    </div>
  );
}

function Legend({ layer, dark }: { layer: LayerId; dark: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const ticks = LEGEND[layer];
  return (
    <div className={cn(PANEL, "pointer-events-auto w-64 px-3 py-2")}>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{t(`observatory.layers.${layer}`)}</span>
        <span>{t(`observatory.units.${layer}`)}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: legendGradient(layer, dark) }} dir="ltr" />
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground" dir="ltr">
        {ticks.map((v) => <span key={v}>{f.number(v)}</span>)}
      </div>
      {/* Plain words under each colour band, so the map reads without numbers */}
      <div className="mt-0.5 grid text-center text-[10px] font-medium text-foreground/80" dir="ltr" style={{ gridTemplateColumns: `repeat(${BANDS[layer]}, 1fr)` }}>
        {Array.from({ length: BANDS[layer] }, (_, k) => <span key={k} className="truncate px-0.5">{t(`observatory.bands.${layer}.${k}` as MessageKey)}</span>)}
      </div>
    </div>
  );
}

function TimeBar({ times, days, step, nowStep, playing, onStep, onTogglePlay, updatedAt }: {
  times: string[]; days: string[]; step: number; nowStep: number; playing: boolean;
  onStep: (s: number) => void; onTogglePlay: () => void; updatedAt: string;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const curDay = omanDay(times[step]);
  return (
    <div className={cn(PANEL, "pointer-events-auto w-full max-w-4xl space-y-2 self-center p-2.5 sm:p-3")}>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="default" className="h-9 w-9 shrink-0 rounded-full" onClick={onTogglePlay} aria-label={playing ? t("observatory.pause") : t("observatory.play")}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold tabular-nums">
            {f.date(times[step], { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}
            {step === nowStep && <span className="ms-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t("observatory.now")}</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">{t("observatory.updated", { time: f.relative(updatedAt) })}</div>
        </div>
        {step !== nowStep && (
          <Button size="sm" variant="outline" onClick={() => onStep(nowStep)}>{t("observatory.now")}</Button>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={times.length - 1}
        value={step}
        onChange={(e) => onStep(Number(e.target.value))}
        className="obs-range w-full accent-[hsl(var(--primary))]"
        aria-label={t("observatory.tabs.map")}
      />
      {/* Time runs in reading direction: right → left in Arabic */}
      <div className="flex gap-1 overflow-x-auto">
        {days.map((d) => {
          const first = times.findIndex((ti) => omanDay(ti) === d);
          const noon = times.findIndex((ti) => omanDay(ti) === d && Date.parse(ti) >= Date.parse(noonOf(d)));
          return (
            <button
              key={d}
              onClick={() => onStep(noon >= 0 ? noon : first)}
              className={cn(
                "min-w-[3.5rem] flex-1 rounded-md px-2 py-1 text-center text-[11px] transition-colors",
                d === curDay ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {f.date(noonOf(d), { weekday: "short", day: "numeric" })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WarningsPanel({ data, dayIdx, onDay, items, selectedIso, onSelectIso }: {
  data: WarningsResult; dayIdx: number; onDay: (d: number) => void; items: Warning[];
  selectedIso: string | null; onSelectIso: (iso: string | null) => void;
}) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const worstOfDay = (d: number) => Math.max(0, ...Object.values(data.levels).map((lv) => lv[d] ?? 0)) as Level;
  const shown = selectedIso ? items.filter((w) => w.iso === selectedIso) : items;

  return (
    <aside
      className={cn(
        PANEL,
        "absolute inset-x-3 bottom-3 z-[1000] flex max-h-[48%] flex-col overflow-hidden",
        "sm:inset-x-auto sm:bottom-5 sm:end-5 sm:top-5 sm:max-h-none sm:w-[380px]",
      )}
      aria-label={t("observatory.tabs.warnings")}
    >
      <div className="border-b border-border/60 p-3">
        <div className="flex gap-1">
          {data.days.map((d, k) => {
            const lv = worstOfDay(k);
            return (
              <button
                key={d}
                onClick={() => onDay(k)}
                aria-pressed={k === dayIdx}
                className={cn(
                  "flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] transition-colors",
                  k === dayIdx ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                <span>{f.date(noonOf(d), { weekday: "short", day: "numeric" })}</span>
                <span className="h-1.5 w-6 rounded-full" style={{ background: lv ? LEVEL_COLOR[lv] : "hsl(var(--border))" }} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            {selectedIso ? (isAr ? GOV_NAMES[selectedIso]?.nameAr : GOV_NAMES[selectedIso]?.name) : t("observatory.allGovernorates")}
          </div>
          {selectedIso ? (
            <button onClick={() => onSelectIso(null)} className="text-xs text-primary hover:underline">{t("observatory.allGovernorates")}</button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("observatory.warningsCount", { n: f.number(items.length) })}</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ShieldCheck className="h-8 w-8 text-success" strokeWidth={1.6} />
            <div className="text-sm font-medium">{t("observatory.noWarnings")}</div>
            <div className="text-xs text-muted-foreground">{t("observatory.noWarningsDesc")}</div>
          </div>
        ) : (
          shown.map((w, i) => <WarningCard key={`${w.iso}-${w.hazard}-${i}`} w={w} onSelect={() => onSelectIso(w.iso)} />)
        )}
      </div>

      <div className="border-t border-border/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {([1, 2, 3] as Level[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_COLOR[l] }} />
              {t(`observatory.level.${l}` as MessageKey)} — {t(`observatory.levelMeaning.${l}` as MessageKey)}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WarningCard({ w, onSelect }: { w: Warning; onSelect: () => void }) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const Icon = HAZARD_ICON[w.hazard];
  const gov = GOV_NAMES[w.iso];
  const peakKey = `observatory.peak.${w.hazard}` as MessageKey;
  const peak = t(peakKey, { v: f.number(w.peak) });
  return (
    <button
      onClick={onSelect}
      className="flex w-full gap-3 rounded-lg border border-border/60 bg-background/60 p-3 text-start transition-colors hover:bg-accent/50"
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold">{t(`observatory.hazard.${w.hazard}`)}</span>
          <span className="ms-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${LEVEL_COLOR[w.level]}33`, color: "inherit" }}>
            {t(`observatory.level.${w.level}` as MessageKey)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {isAr ? gov?.nameAr : gov?.name} · {t("observatory.window", {
            from: f.date(w.from, { weekday: "short", hour: "numeric" }),
            to: f.date(w.to, { hour: "numeric" }),
          })}
          {peak !== peakKey && w.peak > 0 && <> · {peak}</>}
        </div>
        <p className="text-xs leading-relaxed text-foreground/85">{t(`observatory.advice.${w.hazard}${w.level}` as MessageKey)}</p>
      </div>
    </button>
  );
}
