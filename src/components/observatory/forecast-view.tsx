"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Droplets, LocateFixed, Sun, Sunrise, Sunset, Wind,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { conditionFromCode } from "@/lib/weather/conditions";
import type { PlaceForecast, Wilayat } from "@/lib/observatory/place";
import type { Level, Warning } from "@/lib/observatory/warnings";
import wilayatsJson from "@/lib/observatory/wilayats.json";
import { GOV_FEATURES } from "./field";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const WILAYATS = (wilayatsJson as { wilayats: Wilayat[] }).wilayats;
const GOV = Object.fromEntries(GOV_FEATURES.map((f) => [f.properties.iso, f.properties]));
const ICON: Record<string, LucideIcon> = {
  CLEAR: Sun, PARTLY_CLOUDY: CloudSun, CLOUDY: Cloud, FOG: CloudFog, DRIZZLE: CloudDrizzle, RAIN: CloudRain, THUNDERSTORM: CloudLightning,
};
const LEVEL_COLOR: Record<number, string> = { 1: "#e3c14f", 2: "#e08a3c", 3: "#c8463d" };
const STORE = "aegis-obs-wilayat";
const DEFAULT_ID = WILAYATS.find((w) => w.name === "Muscat")?.id ?? WILAYATS[0].id;
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
const arrow = (fromDeg: number) => ARROWS[Math.round(((fromDeg + 180) % 360) / 45) % 8];

export function nearestWilayat(lat: number, lon: number): Wilayat {
  return WILAYATS.reduce((b, w) => (Math.hypot(w.lat - lat, w.lon - lon) < Math.hypot(b.lat - lat, b.lon - lon) ? w : b));
}

export function ForecastView({ warnings, myPos, onLocate, onShowOnMap }: {
  warnings: Warning[];
  myPos: { lat: number; lon: number } | null;
  onLocate: () => void;
  onShowOnMap: (iso: string) => void;
}) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const [id, setId] = useState<string>(DEFAULT_ID);
  const [day, setDay] = useState(0);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORE); if (saved && WILAYATS.some((w) => w.id === saved)) setId(saved); } catch { /* private mode */ }
  }, []);
  // "Nearest to me" picks the wilayat once a position arrives
  useEffect(() => { if (myPos) choose(nearestWilayat(myPos.lat, myPos.lon).id); }, [myPos]);
  function choose(next: string) {
    setId(next); setDay(0);
    try { localStorage.setItem(STORE, next); } catch { /* private mode */ }
  }

  const { data, loading } = useApi<PlaceForecast>(`/api/observatory/place?id=${id}`, { refreshMs: 30 * 60_000 });
  const place = WILAYATS.find((w) => w.id === id)!;
  const gov = GOV[place.gov];
  const govWarnings = warnings.filter((w) => w.iso === place.gov);
  const name = (w: Wilayat) => (isAr ? w.nameAr : w.name);

  const hours = useMemo(() => {
    if (!data) return [];
    const date = data.daily.date[day];
    const now = Date.now() - 3600_000;
    return data.hourly.time
      .map((time, k) => ({ k, time }))
      .filter(({ time }) => time.startsWith(date) && (day > 0 || Date.parse(time) >= now))
      .map(({ k, time }) => ({
        label: f.date(time, { hour: "numeric" }),
        temp: data.hourly.temp[k], feels: data.hourly.feels[k], rain: data.hourly.rain[k], prob: data.hourly.rainProb[k],
        wind: data.hourly.wind[k], gust: data.hourly.gust[k], dir: data.hourly.dir[k],
      }));
  }, [data, day, f]);

  const byGov = useMemo(() => {
    const m = new Map<string, Wilayat[]>();
    for (const w of WILAYATS) m.set(w.gov, [...(m.get(w.gov) ?? []), w]);
    return [...m.entries()].sort((a, b) => (isAr ? GOV[a[0]].nameAr.localeCompare(GOV[b[0]].nameAr, "ar") : GOV[a[0]].name.localeCompare(GOV[b[0]].name)));
  }, [isAr]);

  const cur = data?.current;
  const CurIcon = cur ? ICON[conditionFromCode(cur.code)] ?? Cloud : Cloud;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
        {/* Place picker */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1 space-y-1 sm:max-w-sm">
            <label htmlFor="wilayat" className="text-xs text-muted-foreground">{t("observatory.fc.pick")}</label>
            <NativeSelect id="wilayat" value={id} onChange={(e) => choose(e.target.value)}>
              {byGov.map(([iso, list]) => (
                <optgroup key={iso} label={isAr ? GOV[iso].nameAr : GOV[iso].name}>
                  {[...list].sort((a, b) => name(a).localeCompare(name(b), isAr ? "ar" : "en")).map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <Button variant="outline" onClick={onLocate}><LocateFixed className="h-4 w-4" />{t("observatory.fc.nearest")}</Button>
          <Button variant="ghost" onClick={() => onShowOnMap(place.gov)}>{t("observatory.fc.openMap")}</Button>
        </div>

        {/* Now */}
        <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
          {!cur ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-4">
                <CurIcon className="h-12 w-12 text-primary" strokeWidth={1.5} />
                <div>
                  <div className="text-sm text-muted-foreground">{name(place)} · {isAr ? gov.nameAr : gov.name}</div>
                  <div className="text-5xl font-semibold tabular-nums">{f.number(Math.round(cur.temp))}°</div>
                  <div className="text-sm text-muted-foreground">
                    {f.enum("weatherCondition", conditionFromCode(cur.code))} · {t("observatory.fc.feels", { v: f.number(Math.round(cur.feels)) })}
                  </div>
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Stat icon={Droplets} label={t("observatory.fc.humidity")} value={`${f.number(Math.round(cur.humidity))}%`} />
                <Stat icon={Wind} label={t("observatory.fc.wind")} value={`${f.number(Math.round(cur.wind))} ${t("observatory.units.wind")} ${arrow(cur.dir)}`} />
                <Stat icon={Wind} label={t("observatory.fc.gusts")} value={`${f.number(Math.round(cur.gust))} ${t("observatory.units.wind")}`} />
                {data && <Stat icon={Sun} label={t("observatory.fc.uv")} value={f.number(Math.round(data.daily.uv[0]))} />}
                {data && <Stat icon={Sunrise} label={t("observatory.fc.sunrise")} value={f.date(data.daily.sunrise[0], { hour: "numeric", minute: "2-digit" })} />}
                {data && <Stat icon={Sunset} label={t("observatory.fc.sunset")} value={f.date(data.daily.sunset[0], { hour: "numeric", minute: "2-digit" })} />}
              </dl>
            </div>
          )}
          {govWarnings.length > 0 && (
            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="mb-1.5 text-xs text-muted-foreground">{t("observatory.fc.warningsHere", { gov: isAr ? gov.nameAr : gov.name })}</div>
              <div className="flex flex-wrap gap-1.5">
                {govWarnings.map((w, i) => (
                  <button key={i} onClick={() => onShowOnMap(w.iso)} className="flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs hover:bg-accent">
                    <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[w.level] }} />
                    {t(`observatory.hazard.${w.hazard}`)} · {f.date(`${w.day}T08:00:00Z`, { weekday: "short" })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Seven days */}
        {data ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {data.daily.date.map((d, k) => {
              const Icon = ICON[conditionFromCode(data.daily.code[k])] ?? Cloud;
              const lvl = Math.max(0, ...warnings.filter((w) => w.iso === place.gov && w.day === d).map((w) => w.level)) as Level;
              return (
                <button
                  key={d}
                  onClick={() => setDay(k)}
                  aria-pressed={day === k}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-colors",
                    day === k ? "border-primary/50 bg-primary/10" : "border-border/60 hover:bg-accent/50",
                  )}
                >
                  {lvl > 0 && <span className="absolute end-2 top-2 h-2 w-2 rounded-full" style={{ background: LEVEL_COLOR[lvl] }} aria-hidden />}
                  <span className="text-xs font-medium">{k === 0 ? t("observatory.fc.today") : f.date(`${d}T08:00:00Z`, { weekday: "short" })}</span>
                  <Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.6} />
                  <span className="text-sm font-semibold tabular-nums">{f.number(Math.round(data.daily.max[k]))}°<span className="ms-1 font-normal text-muted-foreground">{f.number(Math.round(data.daily.min[k]))}°</span></span>
                  <span className={cn("text-[11px] tabular-nums", data.daily.rainProb[k] >= 40 ? "text-info" : "text-muted-foreground")}>
                    {t("observatory.fc.rainChance", { v: f.number(Math.round(data.daily.rainProb[k])) })}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Skeleton className="h-28 w-full rounded-xl" />
        )}

        {/* Hour by hour */}
        <section className="rounded-2xl border border-border/60 bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("observatory.fc.hourly")}</h2>
          {loading && !data ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <div className="space-y-4" dir="ltr">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={hours} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis yAxisId="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={["dataMin - 2", "dataMax + 2"]} unit="°" allowDecimals={false} tickFormatter={(v: number) => String(Math.round(v))} />
                  <YAxis yAxisId="r" orientation="right" hide domain={[0, (max: number) => Math.max(5, max * 1.4)]} />
                  <Tooltip content={<HourTip />} />
                  <Bar yAxisId="r" dataKey="rain" name={t("observatory.fc.rain")} fill="hsl(var(--info))" fillOpacity={0.55} radius={[3, 3, 0, 0]} barSize={10} />
                  <Line yAxisId="t" dataKey="temp" name={t("observatory.fc.temp")} stroke="hsl(var(--primary))" strokeWidth={2.2} dot={false} />
                  <Line yAxisId="t" dataKey="feels" name={t("observatory.fc.feelsSeries")} stroke="hsl(var(--warning))" strokeWidth={1.4} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={130}>
                <ComposedChart data={hours} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, "dataMax + 5"]} allowDecimals={false} tickFormatter={(v: number) => String(Math.round(v))} />
                  <Tooltip content={<HourTip />} />
                  <Line dataKey="wind" name={t("observatory.fc.windSeries")} stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                  <Line dataKey="gust" name={t("observatory.fc.gustSeries")} stroke="hsl(var(--success))" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <p className="text-center text-[11px] text-muted-foreground">Open-Meteo · © OpenStreetMap</p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="font-medium tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

function HourTip({ active, payload, label }: { active?: boolean; payload?: { payload: Record<string, number> }[]; label?: string }) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border/60 bg-background/95 px-2.5 py-1.5 text-xs shadow-sm" dir={isAr ? "rtl" : "ltr"}>
      <div className="mb-0.5 font-semibold">{label}</div>
      <div>{t("observatory.fc.temp")}: {f.number(Math.round(p.temp))}° · {t("observatory.fc.feelsSeries")}: {f.number(Math.round(p.feels))}°</div>
      <div>{t("observatory.fc.rainProb")}: {f.number(Math.round(p.prob))}% · {f.number(p.rain)} {t("observatory.units.rain").split(" ")[0]}</div>
      <div>{t("observatory.fc.wind")}: {f.number(Math.round(p.wind))} ({t("observatory.fc.gusts")} {f.number(Math.round(p.gust))}) {arrow(p.dir)}</div>
    </div>
  );
}

