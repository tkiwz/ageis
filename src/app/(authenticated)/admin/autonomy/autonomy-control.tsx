"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldOff, ShieldCheck, AlertTriangle, DollarSign, Gauge, Loader2, Zap, PlayCircle } from "lucide-react";
import type { AutonomySettingsDTO } from "@/lib/autonomy/settings";
import { useI18n } from "@/lib/i18n/client";

interface BudgetView {
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  callsLastMinute: number;
  callsLastHour: number;
  limitPerMinute: number;
  limitPerHour: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
  todayByModule: {
    module: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
  }[];
}

interface Props {
  initialSettings: AutonomySettingsDTO;
  initialBudget: BudgetView;
}

export function AutonomyControlPanel({ initialSettings, initialBudget }: Props) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(initialSettings);
  const [budget, setBudget] = useState(initialBudget);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(update: Partial<AutonomySettingsDTO>) {
    setSaved(false);
    setError(null);
    const next = { ...settings, ...update };
    setSettings(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/autonomy/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error?.message ?? t("admin.autonomy.failed"));
          setSettings(settings); // revert
          return;
        }
        setSettings(json.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.autonomy.network"));
        setSettings(settings);
      }
    });
  }

  async function refreshBudget() {
    const res = await fetch("/api/autonomy/budget");
    const json = await res.json();
    if (json.ok) setBudget(json.data);
  }

  const [demoBusy, setDemoBusy] = useState<null | "tick">(null);
  const [demoLog, setDemoLog] = useState<string | null>(null);

  async function runTickNow() {
    setDemoBusy("tick");
    setDemoLog(null);
    try {
      const res = await fetch("/api/autonomy/pipeline/tick", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Tick failed");
      const d = json.data;
      if (d.blocked) {
        setDemoLog(t("admin.autonomy.tickBlocked", { reason: String(d.blocked) }));
      } else {
        const detected = (d.analyzed ?? []).filter((a: { result?: { leakDetected?: boolean } }) => a.result?.leakDetected).length;
        setDemoLog(t("admin.autonomy.tickResult", {
          scanned: d.scanned, hits: d.hits.length, analyzed: d.analyzed?.length ?? 0, leaks: detected,
        }));
      }
      refreshBudget();
    } catch (err) {
      setDemoLog(err instanceof Error ? err.message : t("admin.autonomy.failed"));
    } finally {
      setDemoBusy(null);
    }
  }


  // A 0 limit means "no AI spend allowed" — show it full rather than NaN
  const pctOf = (used: number, limit: number) => (limit > 0 ? Math.min(100, (used / limit) * 100) : 100);
  const dailyPct = pctOf(budget.dailyUsedUsd, budget.dailyLimitUsd);
  const monthlyPct = pctOf(budget.monthlyUsedUsd, budget.monthlyLimitUsd);
  const dailyColor = dailyPct >= 90 ? "bg-destructive" : dailyPct >= 70 ? "bg-risk-medium" : "bg-primary";
  const monthlyColor = monthlyPct >= 90 ? "bg-destructive" : monthlyPct >= 70 ? "bg-risk-medium" : "bg-primary";

  return (
    <div className="space-y-6">
      {/* Master Kill Switch */}
      <Card className={settings.globalEnabled ? "glass border-risk-low/30" : "border-destructive/50 bg-destructive/5"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {settings.globalEnabled ? (
                <ShieldCheck className="mt-1 h-6 w-6 text-risk-low" />
              ) : (
                <ShieldOff className="mt-1 h-6 w-6 text-destructive" />
              )}
              <div>
                <CardTitle className="text-xl">{t("admin.autonomy.master")}</CardTitle>
                <CardDescription>{t("admin.autonomy.masterDesc")}</CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.globalEnabled}
              onCheckedChange={(v) => patch({ globalEnabled: v })}
              disabled={pending}
            />
          </div>
        </CardHeader>
        {!settings.globalEnabled && (
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("admin.autonomy.offTitle")}</AlertTitle>
              <AlertDescription>{t("admin.autonomy.offDesc")}</AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {/* Manual mode (pause background automation) */}
      <Card className={settings.demoMode ? "border-primary/50 bg-primary/5" : "glass"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">{t("admin.autonomy.manual")}</CardTitle>
              <CardDescription>{t("admin.autonomy.manualDesc")}</CardDescription>
            </div>
            <Switch
              checked={settings.demoMode}
              onCheckedChange={(v) => patch({ demoMode: v })}
              disabled={pending}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Per-module switches */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.autonomy.gates")}</CardTitle>
          <CardDescription>{t("admin.autonomy.gatesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModuleToggle
            label={t("admin.autonomy.pipelineLoop")}
            description={t("admin.autonomy.pipelineLoopDesc")}
            value={settings.pipelineLoopEnabled}
            onChange={(v) => patch({ pipelineLoopEnabled: v })}
            disabled={pending || !settings.globalEnabled}
          />
          <ModuleToggle
            label={t("admin.autonomy.forecast")}
            description={t("admin.autonomy.forecastDesc")}
            value={settings.forecastEnabled}
            onChange={(v) => patch({ forecastEnabled: v })}
            disabled={pending || !settings.globalEnabled}
          />
          <ModuleToggle
            label={t("admin.autonomy.voice")}
            description={t("admin.autonomy.voiceDesc")}
            value={settings.voiceActionsEnabled}
            onChange={(v) => patch({ voiceActionsEnabled: v })}
            disabled={pending || !settings.globalEnabled}
          />
          <ModuleToggle
            label={t("admin.autonomy.vision")}
            description={t("admin.autonomy.visionDesc")}
            value={settings.visionAutoActions}
            onChange={(v) => patch({ visionAutoActions: v })}
            disabled={pending || !settings.globalEnabled}
          />
          <ModuleToggle
            label={t("admin.autonomy.permitAuto")}
            description={t("admin.autonomy.permitAutoDesc")}
            value={settings.permitAutoApproval}
            onChange={(v) => patch({ permitAutoApproval: v })}
            disabled={pending || !settings.globalEnabled}
            highlight
          />

          <div className="grid gap-4 border-t border-border/40 pt-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pollSeconds">{t("admin.autonomy.pollSeconds")}</Label>
              <Input
                id="pollSeconds"
                type="number"
                min={10}
                max={3600}
                value={settings.pipelinePollSeconds}
                onChange={(e) => setSettings({ ...settings, pipelinePollSeconds: Number(e.target.value) })}
                onBlur={() => patch({ pipelinePollSeconds: settings.pipelinePollSeconds })}
                disabled={pending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> {t("admin.autonomy.budget")}
            </CardTitle>
            <CardDescription>{t("admin.autonomy.budgetDesc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refreshBudget}>{t("admin.autonomy.refresh")}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Meter
            label={t("admin.autonomy.today")}
            used={budget.dailyUsedUsd}
            limit={budget.dailyLimitUsd}
            pct={dailyPct}
            color={dailyColor}
          />
          <Meter
            label={t("admin.autonomy.thisMonth")}
            used={budget.monthlyUsedUsd}
            limit={budget.monthlyLimitUsd}
            pct={monthlyPct}
            color={monthlyColor}
          />

          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dailyBudget">{t("admin.autonomy.dailyLimit")}</Label>
              <Input
                id="dailyBudget"
                type="number"
                step="0.01"
                min={0}
                value={settings.dailyBudgetUsd}
                onChange={(e) => setSettings({ ...settings, dailyBudgetUsd: Number(e.target.value) })}
                onBlur={() => patch({ dailyBudgetUsd: settings.dailyBudgetUsd })}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="monthlyBudget">{t("admin.autonomy.monthlyLimit")}</Label>
              <Input
                id="monthlyBudget"
                type="number"
                step="0.01"
                min={0}
                value={settings.monthlyBudgetUsd}
                onChange={(e) => setSettings({ ...settings, monthlyBudgetUsd: Number(e.target.value) })}
                onBlur={() => patch({ monthlyBudgetUsd: settings.monthlyBudgetUsd })}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rpm">{t("admin.autonomy.perMinute")}</Label>
              <Input
                id="rpm"
                type="number"
                min={1}
                value={settings.maxCallsPerMinute}
                onChange={(e) => setSettings({ ...settings, maxCallsPerMinute: Number(e.target.value) })}
                onBlur={() => patch({ maxCallsPerMinute: settings.maxCallsPerMinute })}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rph">{t("admin.autonomy.perHour")}</Label>
              <Input
                id="rph"
                type="number"
                min={1}
                value={settings.maxCallsPerHour}
                onChange={(e) => setSettings({ ...settings, maxCallsPerHour: Number(e.target.value) })}
                onBlur={() => patch({ maxCallsPerHour: settings.maxCallsPerHour })}
                disabled={pending}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 border-t border-border/40 pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" />
              {t("admin.autonomy.rateMinute", { used: budget.callsLastMinute, limit: budget.limitPerMinute })}
            </span>
            <span>·</span>
            <span>{t("admin.autonomy.rateHour", { used: budget.callsLastHour, limit: budget.limitPerHour })}</span>
          </div>

          {budget.todayByModule.length > 0 && (
            <div className="border-t border-border/40 pt-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{t("admin.autonomy.byModule")}</div>
              <div className="space-y-1">
                {budget.todayByModule.map((b) => (
                  <div key={b.module} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{b.module}</span>
                    <span className="text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t("admin.autonomy.calls", { n: b.callCount })}
                      </Badge>{" "}
                      <span dir="ltr">${b.costUsd.toFixed(4)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Triggers */}
      <Card className="glass border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> {t("admin.autonomy.triggers")}
          </CardTitle>
          <CardDescription>{t("admin.autonomy.triggersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runTickNow} disabled={!!demoBusy} variant="outline">
              {demoBusy === "tick" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {t("admin.autonomy.runTick")}
            </Button>
          </div>
          {demoLog && (
            <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 font-mono text-xs">
              → {demoLog}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status row */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        {saved && !pending && <span className="text-risk-low">{t("admin.autonomy.saved")}</span>}
        {error && <span className="text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function ModuleToggle(props: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-md border p-3 ${props.highlight ? "border-risk-medium/40 bg-risk-medium/5" : "border-border/40"}`}>
      <div className="flex-1">
        <div className="text-sm font-medium">{props.label}</div>
        <div className="text-xs text-muted-foreground">{props.description}</div>
      </div>
      <Switch
        checked={props.value}
        onCheckedChange={props.onChange}
        disabled={props.disabled}
      />
    </div>
  );
}

function Meter({ label, used, limit, pct, color }: {
  label: string; used: number; limit: number; pct: number; color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono" dir="ltr">
          ${used.toFixed(4)} / ${limit.toFixed(2)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
