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
  { value: "HOT_WORK",        label: "Hot Work (welding, cutting, grinding)" },
  { value: "COLD_WORK",       label: "Cold Work (general maintenance)" },
  { value: "CONFINED_SPACE",  label: "Confined Space Entry" },
  { value: "HEIGHT_WORK",     label: "Work at Heights (>1.8m)" },
  { value: "EXCAVATION",      label: "Excavation / Trenching" },
  { value: "ELECTRICAL",      label: "Electrical Work" },
  { value: "RADIATION",       label: "Radiation / X-Ray" },
  { value: "CHEMICAL",        label: "Chemical Handling" },
];

export default function NewPermitPage() {
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
      setError("Please fill in title and description first");
      return;
    }

    setAnalyzing(true);
    setError(null);

    const prompt = `Analyze this Permit to Work request and respond ONLY with valid JSON.

Type: ${form.type}
Title: ${form.title}
Description: ${form.description}
Site: ${sites.find((s) => s.id === form.siteId)?.name ?? "Unknown"}
Duration: ${form.startDate} to ${form.endDate}

Respond ONLY with this JSON (no markdown, no backticks, no explanation):
{
  "hazards": ["hazard 1", "hazard 2", "hazard 3", "hazard 4"],
  "requiredControls": ["control 1", "control 2", "control 3", "control 4"],
  "requiredPPE": ["PPE 1", "PPE 2", "PPE 3"],
  "preJobChecks": ["check 1", "check 2", "check 3"],
  "riskLevel": "LOW or MEDIUM or HIGH or CRITICAL",
  "summary": "1-2 sentence summary"
}`;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "AI failed");

      const content = json.data?.message ?? json.data?.content ?? json.data?.reply ?? JSON.stringify(json.data ?? "");
      console.log("[Permit AI] raw response:", content);
      
      // Extract JSON object from response (handles markdown, prose, etc.)
      const jsonMatch = String(content).match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response. Check console for details.");
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      setAnalysis(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis failed");
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
        <ChevronLeft className="h-3 w-3" /> Back to Permits
      </Link>

      <Card className="glass">
        <CardHeader>
          <CardTitle>New Permit to Work</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="type">Permit Type *</Label>
              <select
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PERMIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Welding repair on Tank A-205"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description *</Label>
              <textarea
                id="description"
                placeholder="Describe the work in detail: location, scope, equipment, materials..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="site">Site *</Label>
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
                <Label htmlFor="start">Start Date</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">End Date</Label>
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
                  <span className="text-sm font-medium">AI Risk Analysis</span>
                  <span className="text-[10px] text-muted-foreground">Powered by AEGIS</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={analyzeWithAI}
                  disabled={analyzing || !form.title || !form.description}
                >
                  {analyzing ? (
                    <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Brain className="mr-1.5 h-3 w-3" /> {analysis ? "Re-analyze" : "Analyze with AI"}</>
                  )}
                </Button>
              </div>

              {!analysis && !analyzing && (
                <p className="text-xs text-muted-foreground">
                  Fill in title and description, then click &quot;Analyze with AI&quot; to get hazards, controls, and risk level.
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
                      <span className="text-xs text-muted-foreground">AI Risk:</span>
                      <span className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase",
                        riskColor(analysis.riskLevel)
                      )}>{analysis.riskLevel}</span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <AIList icon={AlertTriangle} label="Hazards" items={analysis.hazards} tone="critical" />
                    <AIList icon={Shield}        label="Controls" items={analysis.requiredControls} tone="info" />
                    <AIList icon={HardHat}       label="Required PPE" items={analysis.requiredPPE} tone="info" />
                    <AIList icon={ListChecks}    label="Pre-job Checks" items={analysis.preJobChecks} tone="info" />
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
                <Button type="button" variant="ghost">Cancel</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="mr-1.5 h-3.5 w-3.5" /> Submit Permit</>
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