"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Loader2, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Clock, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";

interface Attempt {
  id: string; email: string; ipAddress: string | null;
  userAgent: string | null; success: boolean;
  failReason: string | null; createdAt: string;
}
interface Lockout {
  id: string; email: string; failCount: number;
  lockedUntil: string | null; lastFailAt: string | null; isActive: boolean;
}
interface DashboardData {
  recentAttempts: Attempt[];
  stats: {
    last24h: { success: number; failed: number };
    last7d: { success: number; failed: number };
    distinctIps24h: number;
    activeLockouts: number;
    failByReason: { reason: string; count: number }[];
    topFailingIps: { ip: string | null; count: number }[];
  };
  lockouts: Lockout[];
  auditChain: { totalEntries: number; hashedEntries: number; unhashedLegacy: number };
  env: {
    nodeEnv: string;
    hasEncryptionKey: boolean;
    hasAuditChainSecret: boolean;
    hasCronSecret: boolean;
    hasMetricsToken: boolean;
    hasDeviceIngestSecret: boolean;
    hasSentryDsn: boolean;
    demoSetupDisabled: boolean;
    nextauthHttpsConfigured: boolean;
    dbIsPostgres: boolean;
  };
}
interface VerifyReport {
  valid: boolean;
  totalEntries: number;
  unhashedCount: number;
  brokenAt?: { id: string; reason: string; createdAt: string };
  sealed?: { id: string; createdAt: string; sealedCount: number; knownBreak: { id: string; reason: string } | null };
}

export function SecurityDashboard() {
  const { t } = useI18n();
  const f = useFormat();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/security/dashboard", { cache: "no-store" });
      let j: { ok?: boolean; data?: DashboardData; error?: { message?: string; code?: string } };
      try {
        j = await r.json();
      } catch {
        throw new Error(`Server returned ${r.status} ${r.statusText} (non-JSON response)`);
      }
      if (!r.ok || !j.ok) {
        throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      }
      if (j.data) setData(j.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyChain() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await fetch("/api/security/audit-verify");
      const j = await r.json();
      if (j.ok) setVerifyResult(j.data);
    } finally { setVerifying(false); }
  }

  async function sealChain() {
    const reason = window.prompt(t("admin.security.chain.sealPrompt"), t("admin.security.chain.sealDefault"));
    if (!reason?.trim()) return;
    setVerifying(true);
    try {
      const r = await fetch("/api/security/audit-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = await r.json();
      if (j.ok) { setVerifyResult(j.data.report); load(); }
      else window.alert(j.error?.message ?? t("admin.security.chain.sealFailed"));
    } finally { setVerifying(false); }
  }

  async function unlock(email: string) {
    setUnlocking(email);
    try {
      await fetch("/api/security/lockouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      load();
    } finally { setUnlocking(null); }
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 30_000);
    return () => window.clearInterval(i);
  }, []);

  if (loading && !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> {t("admin.security.loadFailed")}
          </CardTitle>
          {loadError && (
            <CardDescription className="font-mono text-xs">{loadError}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">{t("admin.security.retryHint")}</div>
          <Button onClick={load} size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5" /> {t("admin.security.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          icon={CheckCircle2}
          label={t("admin.security.kpi.success")}
          value={data.stats.last24h.success}
          tone="success"
        />
        <Kpi
          icon={XCircle}
          label={t("admin.security.kpi.failed")}
          value={data.stats.last24h.failed}
          tone={data.stats.last24h.failed > 10 ? "warning" : "info"}
        />
        <Kpi
          icon={Lock}
          label={t("admin.security.kpi.lockouts")}
          value={data.stats.activeLockouts}
          tone={data.stats.activeLockouts > 0 ? "critical" : "success"}
        />
        <Kpi
          icon={Shield}
          label={t("admin.security.kpi.ips")}
          value={data.stats.distinctIps24h}
          tone="info"
        />
      </div>

      {/* Environment posture */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> {t("admin.security.env.title")}
            </CardTitle>
            <CardDescription>{t("admin.security.env.desc")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("admin.security.refresh")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <EnvCheck ok={data.env.nodeEnv === "production"} label={`NODE_ENV = ${data.env.nodeEnv}`} hint={t("admin.security.env.nodeEnv")} />
          <EnvCheck ok={data.env.hasEncryptionKey} label="ENCRYPTION_KEY set" hint={t("admin.security.env.encryption")} />
          <EnvCheck ok={data.env.hasAuditChainSecret} label="AUDIT_CHAIN_SECRET set" hint={t("admin.security.env.auditSecret")} />
          <EnvCheck ok={data.env.hasCronSecret} label="CRON_SECRET set" hint={t("admin.security.env.cron")} />
          <EnvCheck ok={data.env.hasMetricsToken} label="METRICS_TOKEN set" hint={t("admin.security.env.metrics")} />
          <EnvCheck ok={data.env.hasDeviceIngestSecret} label="DEVICE_INGEST_SECRET set" hint={t("admin.security.env.device")} />
          <EnvCheck ok={data.env.demoSetupDisabled} label="DISABLE_DEMO_SETUP = 1" hint={t("admin.security.env.demo")} critical={data.env.nodeEnv === "production"} />
          <EnvCheck ok={data.env.nextauthHttpsConfigured} label="NEXTAUTH_URL is HTTPS" hint={t("admin.security.env.https")} />
          <EnvCheck ok={data.env.dbIsPostgres} label="Database is PostgreSQL" hint={t("admin.security.env.db")} />
          <EnvCheck ok={data.env.hasSentryDsn} label="Sentry DSN set" hint={t("admin.security.env.sentry")} critical={false} />
        </CardContent>
      </Card>

      {/* Audit chain */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> {t("admin.security.chain.title")}
            </CardTitle>
            <CardDescription>
              {t("admin.security.chain.counts", { total: data.auditChain.totalEntries, hashed: data.auditChain.hashedEntries, legacy: data.auditChain.unhashedLegacy })}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={verifyChain} disabled={verifying}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {t("admin.security.chain.verify")}
          </Button>
        </CardHeader>
        {verifyResult && (
          <CardContent>
            {verifyResult.valid ? (
              <div className="flex items-center gap-2 rounded-md border border-risk-low/40 bg-risk-low/5 px-3 py-2 text-sm text-risk-low">
                <CheckCircle2 className="h-4 w-4" />
                {t("admin.security.chain.valid", { n: verifyResult.totalEntries })}
                {verifyResult.unhashedCount > 0 && <span className="text-muted-foreground"> {t("admin.security.chain.skipped", { n: verifyResult.unhashedCount })}</span>}
                {verifyResult.sealed && (
                  <span className="text-muted-foreground">
                    {" "}{t("admin.security.chain.sealed", {
                      date: f.dateTime(verifyResult.sealed.createdAt),
                      n: verifyResult.sealed.sealedCount,
                      brk: verifyResult.sealed.knownBreak ? t("admin.security.chain.knownBreak", { id: verifyResult.sealed.knownBreak.id }) : "",
                    })}
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  {t("admin.security.chain.invalid")}
                </div>
                {verifyResult.brokenAt && (
                  <div className="mt-2 font-mono text-xs">
                    <div>{t("admin.security.chain.firstBroken")} <span className="font-bold">{verifyResult.brokenAt.id}</span></div>
                    <div>{t("admin.security.chain.reason")} {verifyResult.brokenAt.reason}</div>
                    <div>{t("admin.security.chain.time")} {f.dateTime(verifyResult.brokenAt.createdAt)}</div>
                  </div>
                )}
                {verifyResult.brokenAt?.reason !== "seal-mismatch" && (
                  <Button className="mt-3" variant="outline" size="sm" onClick={sealChain} disabled={verifying}>
                    <Lock className="h-3.5 w-3.5" /> {t("admin.security.chain.seal")}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Active lockouts */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> {t("admin.security.lockouts.title", { n: data.lockouts.length })}
          </CardTitle>
          <CardDescription>{t("admin.security.lockouts.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.lockouts.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">{t("admin.security.lockouts.none")}</div>
          ) : (
            <div className="space-y-1">
              {data.lockouts.map((l) => (
                <div key={l.id} className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                  l.isActive ? "border-destructive/40 bg-destructive/5" : "border-border/40",
                )}>
                  <div className="flex items-center gap-2 min-w-0">
                    {l.isActive ? <Lock className="h-3.5 w-3.5 text-destructive shrink-0" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="font-mono text-xs truncate">{l.email}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t("admin.security.lockouts.failures", { n: l.failCount })}
                    </Badge>
                    {l.isActive && l.lockedUntil && (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                        {t("admin.security.lockouts.until", { time: f.time(l.lockedUntil) })}
                      </Badge>
                    )}
                  </div>
                  {l.isActive && (
                    <Button size="sm" variant="outline" onClick={() => unlock(l.email)} disabled={unlocking === l.email}>
                      {unlocking === l.email ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                      {t("admin.security.lockouts.unlock")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top failing IPs + failure reasons */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.security.ips.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.stats.topFailingIps.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">{t("admin.security.ips.none")}</div>
            ) : (
              <div className="space-y-1">
                {data.stats.topFailingIps.map((x) => (
                  <div key={x.ip ?? "x"} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{x.ip ?? t("admin.security.ips.unknown")}</span>
                    <Badge variant="outline" className="border-risk-medium/40 text-risk-medium">{x.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.security.reasons.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.stats.failByReason.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">{t("admin.security.reasons.none")}</div>
            ) : (
              <div className="space-y-1">
                {data.stats.failByReason.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{r.reason}</span>
                    <Badge variant="outline">{r.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent login attempts */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> {t("admin.security.attempts.title", { n: data.recentAttempts.length })}
          </CardTitle>
          <CardDescription>{t("admin.security.attempts.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1 text-start">{t("admin.security.attempts.time")}</th>
                  <th className="px-2 py-1 text-start">{t("admin.security.attempts.email")}</th>
                  <th className="px-2 py-1 text-start">{t("admin.security.attempts.ip")}</th>
                  <th className="px-2 py-1 text-start">{t("admin.security.attempts.status")}</th>
                  <th className="px-2 py-1 text-start">{t("admin.security.attempts.reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.recentAttempts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {f.dateTime(a.createdAt)}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{a.email}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{a.ipAddress ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {a.success ? (
                        <span className="text-risk-low">✓ {t("admin.security.attempts.success")}</span>
                      ) : (
                        <span className="text-destructive">✕ {t("admin.security.attempts.failed")}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{a.failReason ?? "—"}</td>
                  </tr>
                ))}
                {data.recentAttempts.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">{t("admin.security.attempts.none")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof Shield; label: string; value: number;
  tone: "success" | "warning" | "critical" | "info";
}) {
  const tones = {
    success: "border-risk-low/40 text-risk-low",
    warning: "border-risk-medium/40 text-risk-medium",
    critical: "border-destructive/40 text-destructive",
    info: "border-primary/40 text-primary",
  };
  return (
    <Card className={cn("glass border", tones[tone])}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className="mt-1 font-display text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function EnvCheck({ ok, label, hint, critical = true }: {
  ok: boolean; label: string; hint: string; critical?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md border px-3 py-2",
      ok ? "border-risk-low/30 bg-risk-low/5" : critical ? "border-destructive/40 bg-destructive/5" : "border-risk-medium/30 bg-risk-medium/5",
    )}>
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-risk-low shrink-0 mt-0.5" />
      ) : critical ? (
        <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-risk-medium shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
