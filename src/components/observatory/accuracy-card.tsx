"use client";

import { Award, Target } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { ModelSkill } from "@/lib/observatory/calibration";
import { cn } from "@/lib/utils";

interface Accuracy {
  since: string;
  rainEvents: number;
  models: ModelSkill[];
  stations: { icao: string; name: string; nameAr: string }[];
  names: readonly { id: string; name: string; orgAr: string; org: string }[];
}

/** Public scoreboard: each global model against Oman's airports, and its weight in the blend. */
export function AccuracyCard() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const { data } = useApi<Accuracy>("/api/observatory/accuracy", { refreshMs: 60 * 60_000 });
  if (!data) return null;
  const scored = data.models.filter((m) => m.tempMae !== null);
  const ranked = [...data.models].sort((a, b) => (a.tempMae ?? 99) - (b.tempMae ?? 99));
  const days = Math.max(0, ...data.models.map((m) => m.days));
  const meta = (id: string) => data.names.find((n) => n.id === id);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" />{t("observatory.acc.title")}</h2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {t("observatory.acc.desc", { stations: data.stations.map((s) => (isAr ? s.nameAr : s.name)).join(isAr ? "، " : ", "), days: f.number(Math.max(days, 1)) })}
      </p>
      {scored.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("observatory.acc.building")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-1.5 text-start font-medium">{t("observatory.acc.model")}</th>
                <th className="py-1.5 text-start font-medium">{t("observatory.acc.temp")}</th>
                <th className="py-1.5 text-start font-medium">{t("observatory.acc.rain")}</th>
                <th className="py-1.5 text-start font-medium">{t("observatory.acc.weight")}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((m, k) => (
                <tr key={m.id} className="border-b border-border/30 last:border-0">
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      {meta(m.id)?.name}
                      {k === 0 && m.tempMae !== null && (
                        <span className="flex items-center gap-0.5 rounded bg-success/15 px-1 text-[10px] text-success"><Award className="h-3 w-3" />{t("observatory.acc.best")}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{isAr ? meta(m.id)?.orgAr : meta(m.id)?.org}</div>
                  </td>
                  <td className="py-1.5 tabular-nums">{m.tempMae === null ? "—" : t("observatory.acc.degrees", { v: f.number(Math.round(m.tempMae * 10) / 10) })}</td>
                  <td className="py-1.5 tabular-nums">{m.pod === null || data.rainEvents < 5 ? <span className="text-muted-foreground">{t("observatory.acc.noRain")}</span> : `${f.number(Math.round(m.pod * 100))}%`}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full bg-primary")} style={{ width: `${Math.min(100, (m.weight / 2) * 100)}%` }} />
                      </div>
                      <span className="tabular-nums">{f.number(m.weight)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
