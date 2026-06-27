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
}

export function SecurityDashboard() {
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
    // Detect the most common cause: Prisma client not regenerated for new tables.
    const isPrismaTypeError = /\.loginAttempt|\.accountLockout|does not exist|Cannot read|undefined/i.test(loadError ?? "");
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> Security dashboard failed to load
          </CardTitle>
          {loadError && (
            <CardDescription className="font-mono text-xs">{loadError}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {isPrismaTypeError ? (
            <>
              <div className="text-sm">
                The new security tables (<code className="font-mono">LoginAttempt</code>, <code className="font-mono">AccountLockout</code>) exist in the database, but Prisma Client hasn&apos;t been regenerated yet.
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-primary">Fix in your terminal</div>
                <pre className="text-xs font-mono whitespace-pre-wrap">{`# Stop the dev server (Ctrl+C), then:
npx prisma generate
npm run dev`}</pre>
              </div>
              <div className="text-xs text-muted-foreground">
                After regeneration, refresh this page — the dashboard will load.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm">Click retry — if it keeps failing, check the server console.</div>
              <Button onClick={load} size="sm" variant="outline">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </>
          )}
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
          label="Successful logins (24h)"
          value={data.stats.last24h.success}
          tone="success"
        />
        <Kpi
          icon={XCircle}
          label="Failed logins (24h)"
          value={data.stats.last24h.failed}
          tone={data.stats.last24h.failed > 10 ? "warning" : "info"}
        />
        <Kpi
          icon={Lock}
          label="Active lockouts"
          value={data.stats.activeLockouts}
          tone={data.stats.activeLockouts > 0 ? "critical" : "success"}
        />
        <Kpi
          icon={Shield}
          label="Distinct IPs (24h)"
          value={data.stats.distinctIps24h}
          tone="info"
        />
      </div>

      {/* Environment posture */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Environment posture
            </CardTitle>
            <CardDescription>Critical secrets and production flags</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <EnvCheck ok={data.env.nodeEnv === "production"} label={`NODE_ENV = ${data.env.nodeEnv}`} hint="should be 'production' in prod" />
          <EnvCheck ok={data.env.hasEncryptionKey} label="ENCRYPTION_KEY set" hint="for AES-256-GCM field encryption" />
          <EnvCheck ok={data.env.hasAuditChainSecret} label="AUDIT_CHAIN_SECRET set" hint="for HMAC audit chain" />
          <EnvCheck ok={data.env.hasCronSecret} label="CRON_SECRET set" hint="for cron auth" />
          <EnvCheck ok={data.env.hasMetricsToken} label="METRICS_TOKEN set" hint="for /api/metrics scrape" />
          <EnvCheck ok={data.env.hasDeviceIngestSecret} label="DEVICE_INGEST_SECRET set" hint="for ESP32 ingest" />
          <EnvCheck ok={data.env.demoSetupDisabled} label="DISABLE_DEMO_SETUP = 1" hint="must be on in production" critical={data.env.nodeEnv === "production"} />
          <EnvCheck ok={data.env.nextauthHttpsConfigured} label="NEXTAUTH_URL is HTTPS" hint="prod requirement" />
          <EnvCheck ok={data.env.dbIsPostgres} label="Database is PostgreSQL" hint="SQLite is dev-only" />
          <EnvCheck ok={data.env.hasSentryDsn} label="Sentry DSN set" hint="optional but recommended" critical={false} />
        </CardContent>
      </Card>

      {/* Audit chain */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Audit chain integrity
            </CardTitle>
            <CardDescription>
              {data.auditChain.totalEntries} total entries · {data.auditChain.hashedEntries} chained · {data.auditChain.unhashedLegacy} legacy (pre-chain)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={verifyChain} disabled={verifying}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Verify chain
          </Button>
        </CardHeader>
        {verifyResult && (
          <CardContent>
            {verifyResult.valid ? (
              <div className="flex items-center gap-2 rounded-md border border-risk-low/40 bg-risk-low/5 px-3 py-2 text-sm text-risk-low">
                <CheckCircle2 className="h-4 w-4" />
                Chain valid — {verifyResult.totalEntries} entries verified.
                {verifyResult.unhashedCount > 0 && <span className="text-muted-foreground"> ({verifyResult.unhashedCount} legacy entries skipped)</span>}
              </div>
            ) : (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Chain INVALID — tampering detected
                </div>
                {verifyResult.brokenAt && (
                  <div className="mt-2 font-mono text-xs">
                    <div>First broken entry: <span className="font-bold">{verifyResult.brokenAt.id}</span></div>
                    <div>Reason: {verifyResult.brokenAt.reason}</div>
                    <div>Time: {new Date(verifyResult.brokenAt.createdAt).toLocaleString()}</div>
                  </div>
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
            <Lock className="h-4 w-4" /> Account lockouts ({data.lockouts.length})
          </CardTitle>
          <CardDescription>Active = currently locked. Others have past failures but are not locked.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.lockouts.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">No lockouts on record.</div>
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
                      {l.failCount} failures
                    </Badge>
                    {l.isActive && l.lockedUntil && (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                        until {new Date(l.lockedUntil).toLocaleTimeString()}
                      </Badge>
                    )}
                  </div>
                  {l.isActive && (
                    <Button size="sm" variant="outline" onClick={() => unlock(l.email)} disabled={unlocking === l.email}>
                      {unlocking === l.email ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                      Unlock
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
            <CardTitle className="text-base">Top failing IPs (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.stats.topFailingIps.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">No failures in last 24h.</div>
            ) : (
              <div className="space-y-1">
                {data.stats.topFailingIps.map((t) => (
                  <div key={t.ip ?? "x"} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{t.ip ?? "<unknown>"}</span>
                    <Badge variant="outline" className="border-risk-medium/40 text-risk-medium">{t.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Failure reasons (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.stats.failByReason.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">Nothing to report.</div>
            ) : (
              <div className="space-y-1">
                {data.stats.failByReason.map((f) => (
                  <div key={f.reason} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{f.reason}</span>
                    <Badge variant="outline">{f.count}</Badge>
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
            <Clock className="h-4 w-4" /> Recent login attempts ({data.recentAttempts.length})
          </CardTitle>
          <CardDescription>Latest 50 attempts — success, failure, who, where.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1 text-left">Time</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">IP</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.recentAttempts.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{a.email}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{a.ipAddress ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {a.success ? (
                        <span className="text-risk-low">✓ success</span>
                      ) : (
                        <span className="text-destructive">✕ failed</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{a.failReason ?? "—"}</td>
                  </tr>
                ))}
                {data.recentAttempts.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">No login attempts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick test commands */}
      <Card className="glass border-primary/30">
        <CardHeader>
          <CardTitle className="text-base">Test commands</CardTitle>
          <CardDescription>Run these from your terminal to validate the security controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <TestCommand
            label="Brute-force test (should lock after 5 fails)"
            cmd={`for i in {1..7}; do curl -sX POST http://localhost:3000/api/auth/callback/credentials -d 'email=admin@aegis.local&password=wrong' > /dev/null; done`}
          />
          <TestCommand
            label="CSRF block (should return 403)"
            cmd={`curl -sX POST http://localhost:3000/api/permits -H 'Origin: https://evil.com' -H 'Content-Type: application/json' -d '{}'`}
          />
          <TestCommand
            label="Audit chain verify"
            cmd={`curl -s http://localhost:3000/api/security/audit-verify | jq`}
          />
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

function TestCommand({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap text-[11px] font-mono">{cmd}</code>
        <Button
          size="sm" variant="outline"
          onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
