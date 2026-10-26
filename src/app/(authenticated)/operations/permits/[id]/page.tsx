"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, Loader2, Trash2, CheckCircle2, XCircle,
  Sparkles, Brain, AlertTriangle, Shield, HardHat, ListChecks,
  MapPin, User, Calendar, ClipboardCheck,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { cn, riskColor, formatDateTime } from "@/lib/utils";
import { ShareInsightButton } from "@/components/knowledge/share-insight-button";
import { useI18n } from "@/lib/i18n/client";
import { useFormat } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

interface Permit {
  id: string;
  permitNumber: string;
  title: string;
  description: string;
  type: string;
  status: string;
  riskLevel: string;
  location: string | null;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  approvedAt: string | null;
  aiAnalysis: string | null;
  site: { code: string; name: string; nameAr: string | null } | null;
  requester: { name: string; role: string; email: string } | null;
  approver:  { name: string; role: string } | null;
}

interface AIAnalysis {
  hazards?: string[];
  requiredControls?: string[];
  requiredPPE?: string[];
  preJobChecks?: string[];
  riskLevel?: string;
  summary?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "border-risk-medium/40 bg-risk-medium/5 text-risk-medium",
  ACTIVE:    "border-risk-low/40 bg-risk-low/5 text-risk-low",
  REJECTED:  "border-risk-critical/40 bg-risk-critical/5 text-risk-critical",
  EXPIRED:   "border-border/40 bg-muted/20 text-muted-foreground",
  COMPLETED: "border-primary/40 bg-primary/5 text-primary",
};

function parseAI(raw: string | null): AIAnalysis | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export default function PermitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n();
  const f = useFormat();
  const { id } = use(params);
  const router = useRouter();
  const { data: permit, loading, refresh } = useApi<Permit>(`/api/permits/${id}`);

  const [acting, setActing] = useState<"approve" | "reject" | "revoke" | "delete" | "analyze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshAI, setFreshAI] = useState<AIAnalysis | null>(null);

  const ai = useMemo(() => freshAI ?? parseAI(permit?.aiAnalysis ?? null), [freshAI, permit?.aiAnalysis]);

  async function handleAction(action: "APPROVE" | "REJECT" | "REVOKE") {
    let reason: string | undefined;
    if (action !== "APPROVE") {
      reason = window.prompt(t(action === "REJECT" ? "ops.permits.actions.rejectReason" : "ops.permits.actions.revokeReason"))?.trim();
      if (!reason) return;
    }
    setActing(action.toLowerCase() as "approve" | "reject" | "revoke");
    setError(null);
    try {
      const res = await fetch(`/api/permits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? t("ops.permits.actions.failed"));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ops.permits.actions.failed"));
    } finally {
      setActing(null);
    }
  }

  async function handleDelete() {
    if (!confirm(t("ops.permits.actions.confirmDelete", { n: permit?.permitNumber ?? "" }))) return;
    setActing("delete");
    setError(null);
    try {
      const res = await fetch(`/api/permits/${id}`, {
        method: "DELETE", credentials: "include",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? t("ops.permits.actions.failed"));
      router.push("/operations/permits");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ops.permits.actions.failed"));
      setActing(null);
    }
  }

  async function handleAnalyze() {
    if (!permit) return;
    setActing("analyze");
    setError(null);

    try {
      const res = await fetch("/api/permits/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permitId: id }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? t("ops.permits.ai.failed"));
      setFreshAI(json.data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ops.permits.ai.failed"));
    } finally {
      setActing(null);
    }
  }

  if (loading) return (
    <div className="container mx-auto px-6 py-12 text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!permit) return (
    <div className="container mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
      {t("ops.permits.notFound")}
    </div>
  );

  const canApprove = ["PENDING", "DRAFT", "SUBMITTED", "IN_REVIEW"].includes(permit.status);
  const canRevoke  = permit.status === "ACTIVE";

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/operations/permits" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-3 w-3 rtl:rotate-180" /> {t("ops.permits.back")}
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-xs text-muted-foreground">{permit.permitNumber}</span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase",
            STATUS_COLORS[permit.status] ?? STATUS_COLORS.PENDING)}>
            {f.enum("status", permit.status)}
          </span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase", riskColor(permit.riskLevel))}>
            {f.enum("severity", permit.riskLevel)}
          </span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl tracking-tight">{permit.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{f.enum("permitType", permit.type)}</p>
          </div>
          <ShareInsightButton contextType="permit" contextId={permit.id} />
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info icon={MapPin}  label={t("ops.permits.site")}       value={permit.site?.name ?? "-"} sub={permit.location ?? ""} />
        <Info icon={User}    label={t("ops.permits.requested")}  value={permit.requester?.name ?? "-"} sub={permit.requester?.role ? t(`roles.${permit.requester.role}` as MessageKey) : ""} />
        <Info icon={Calendar} label={t("ops.permits.validFrom")}  value={f.dateTime(permit.validFrom)} />
        <Info icon={Calendar} label={t("ops.permits.validUntil")} value={f.dateTime(permit.validUntil)} />
      </div>

      <Card className="glass mb-6">
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t("ops.permits.description")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-line">{permit.description}</p>
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <Card className="glass mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("ops.permits.ai.title")}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={acting === "analyze"}>
              {acting === "analyze" ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> {t("ops.permits.ai.analysing")}</>
              ) : (
                <><Brain className="h-3 w-3" /> {ai ? t("ops.permits.ai.reanalyse") : t("ops.permits.ai.analyse")}</>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!ai && acting !== "analyze" && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("ops.permits.ai.none")}
            </div>
          )}
          {ai && (
            <div className="space-y-4">
              {ai.summary && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-primary">{t("ops.permits.ai.summary")}</div>
                  <p className="mt-1 text-sm leading-relaxed">{ai.summary}</p>
                </div>
              )}
              {ai.riskLevel && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("ops.permits.ai.risk")}</span>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase", riskColor(ai.riskLevel))}>
                    {f.enum("severity", ai.riskLevel)}
                  </span>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <AIList icon={AlertTriangle} label={t("ops.permits.ai.hazards")} items={ai.hazards}          tone="critical" />
                <AIList icon={Shield}        label={t("ops.permits.ai.controls")} items={ai.requiredControls} tone="info" />
                <AIList icon={HardHat}       label={t("ops.permits.ai.ppe")} items={ai.requiredPPE}      tone="info" />
                <AIList icon={ListChecks}    label={t("ops.permits.ai.checks")} items={ai.preJobChecks}     tone="info" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 rounded-md border border-risk-critical/40 bg-risk-critical/5 p-3 text-sm text-risk-critical">
          {error}
        </div>
      )}

      {/* Actions */}
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={handleDelete} disabled={acting !== null}
              className="text-risk-critical hover:bg-risk-critical/10">
              {acting === "delete" ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ops.permits.actions.deleting")}</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5" /> {t("ops.permits.actions.delete")}</>
              )}
            </Button>

            {canApprove && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => handleAction("REJECT")} disabled={acting !== null}
                  className="text-risk-critical hover:bg-risk-critical/10">
                  {acting === "reject" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ops.permits.actions.rejecting")}</>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5" /> {t("ops.permits.actions.reject")}</>
                  )}
                </Button>
                <Button onClick={() => handleAction("APPROVE")} disabled={acting !== null}>
                  {acting === "approve" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ops.permits.actions.approving")}</>
                  ) : (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> {t("ops.permits.actions.approve")}</>
                  )}
                </Button>
              </div>
            )}
            {canRevoke && (
              <Button variant="outline" onClick={() => handleAction("REVOKE")} disabled={acting !== null}
                className="text-risk-critical hover:bg-risk-critical/10">
                {acting === "revoke" ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ops.permits.actions.revoking")}</>
                ) : (
                  <><XCircle className="h-3.5 w-3.5" /> {t("ops.permits.actions.revoke")}</>
                )}
              </Button>
            )}
          </div>

          {permit.approvedAt && permit.approver && (
            <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
              {t(permit.status === "REJECTED" ? "ops.permits.actions.rejectedBy" : "ops.permits.actions.approvedBy", {
                name: permit.approver.name,
                role: t(`roles.${permit.approver.role}` as MessageKey),
                date: f.dateTime(permit.approvedAt),
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ icon: Icon, label, value, sub }: {
  icon: typeof MapPin; label: string; value: string; sub?: string;
}) {
  return (
    <Card className="glass">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className="mt-1 text-sm font-medium">{value}</div>
        {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AIList({ icon: Icon, label, items, tone }: {
  icon: typeof AlertTriangle; label: string; items?: string[]; tone: "critical" | "info";
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={cn("mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider",
        tone === "critical" && "text-risk-critical",
        tone === "info"     && "text-primary")}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5 rounded-md border border-border/40 bg-background/30 p-1.5 text-[11px]">
            <span className="text-[9px] text-muted-foreground mt-0.5">{i + 1}.</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}