"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft, Loader2, Save, Brain, AlertTriangle,
  Shield, HardHat, ListChecks, Sparkles,
} from "lucide-react";
import { cn, riskColor } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

interface Site {
  id: string;
  code: string;
  name: string;
}

interface AIAnalysis {
  hazards?: string[];
  requiredControls?: string[];
  requiredPPE?: string[];
  preJobChecks?: string[];
  riskLevel?: string;
  summary?: string;
}

const PERMIT_TYPES = [
  { value: "HOT_WORK" },
  { value: "COLD_WORK" },
  { value: "CONFINED_SPACE" },
  { value: "HEIGHT_WORK" },
  { value: "EXCAVATION" },
  { value: "ELECTRICAL" },
  { value: "RADIATION" },
  { value: "CHEMICAL" },
];

export default function NewPermitPage() {
  const { t } = useI18n();
  const f = useFormat();
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "HOT_WORK",
    siteId: "",
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });

  useEffect(() => {
    fetch("/api/sites", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          setSites(j.data);
          if (j.data.length > 0) setForm((f) => ({ ...f, siteId: j.data[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  async function analyzeWithAI() {
    if (!form.title.trim() || !form.description.trim()) {
      setError(t("ops.permits.ai.fillFirst"));
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/permits/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: form.type, title: form.title, description: form.description, siteId: form.siteId || undefined, startDate: form.startDate || undefined, endDate: form.endDate || undefined }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? t("ops.permits.ai.failed"));
      setAnalysis(json.data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ops.permits.ai.failed"));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          siteId: form.siteId,
          startDate: form.startDate,
          endDate: form.endDate,
          riskLevel: analysis?.riskLevel ?? "MEDIUM",
          aiAnalysis: analysis ? JSON.stringify(analysis) : null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");

      router.push("/operations/permits");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-6 py-6">
      <Link href="/operations/permits" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-3 w-3 rtl:rotate-180" /> {t("ops.permits.back")}
      </Link>

      <Card className="glass">
        <CardHeader>
          <CardTitle>{t("ops.permits.form.heading")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="type">{t("ops.permits.form.type")} *</Label>
              <select
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PERMIT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>{t(`ops.permits.form.types.${p.value}` as MessageKey)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">{t("ops.permits.form.title")} *</Label>
              <Input
                id="title"
                placeholder={t("ops.permits.form.titlePh")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">{t("ops.permits.form.description")} *</Label>
              <textarea
                id="description"
                placeholder={t("ops.permits.form.descriptionPh")}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="site">{t("ops.permits.form.site")} *</Label>
              <select
                id="site"
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">{t("ops.permits.form.start")}</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">{t("ops.permits.form.end")}</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{t("ops.permits.ai.title")}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={analyzeWithAI}
                  disabled={analyzing || !form.title || !form.description}
                >
                  {analyzing ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> {t("ops.permits.ai.analysing")}</>
                  ) : (
                    <><Brain className="h-3 w-3" /> {analysis ? t("ops.permits.ai.reanalyse") : t("ops.permits.ai.analyse")}</>
                  )}
                </Button>
              </div>

              {!analysis && !analyzing && (
                <p className="text-xs text-muted-foreground">
                  {t("ops.permits.ai.noneDraft")}
                </p>
              )}

              {analysis && (
                <div className="space-y-3 mt-3">
                  {analysis.summary && (
                    <div className="rounded-md bg-background/50 p-2.5">
                      <p className="text-xs leading-relaxed">{analysis.summary}</p>
                    </div>
                  )}

                  {analysis.riskLevel && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("ops.permits.ai.risk")}</span>
                      <span className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase",
                        riskColor(analysis.riskLevel)
                      )}>{f.enum("severity", analysis.riskLevel)}</span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <AIList icon={AlertTriangle} label={t("ops.permits.ai.hazards")} items={analysis.hazards} tone="critical" />
                    <AIList icon={Shield}        label={t("ops.permits.ai.controls")} items={analysis.requiredControls} tone="info" />
                    <AIList icon={HardHat}       label={t("ops.permits.ai.ppe")} items={analysis.requiredPPE} tone="info" />
                    <AIList icon={ListChecks}    label={t("ops.permits.ai.checks")} items={analysis.preJobChecks} tone="info" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-risk-critical/40 bg-risk-critical/5 p-3 text-sm text-risk-critical">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Link href="/operations/permits">
                <Button type="button" variant="ghost">{t("ops.permits.form.cancel")}</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ops.permits.form.saving")}</>
                ) : (
                  <><Save className="h-3.5 w-3.5" /> {t("ops.permits.form.submit")}</>
                )}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AIList({ icon: Icon, label, items, tone }: {
  icon: typeof AlertTriangle; label: string; items?: string[]; tone: "critical" | "info";
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={cn(
        "mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider",
        tone === "critical" && "text-risk-critical",
        tone === "info"     && "text-primary"
      )}>
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