"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles, Activity, Database, Loader2, Play, ChevronDown, ChevronUp, AlertTriangle, ThumbsUp, ThumbsDown, Zap, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentRun {
  id: string;
  agentName: string;
  confidence: number | null;
  durationMs: number | null;
  status: string;
  tokensUsed: number;
}
interface Session {
  id: string;
  trigger: string;
  signalType: string | null;
  status: string;
  conclusion: string | null;
  conclusionAr: string | null;
  confidence: number | null;
  requiresApproval: boolean;
  durationMs: number | null;
  totalTokens: number;
  startedAt: string;
  agentsConsulted: string | null;
  actionsRecommended: string | null;
  actionsTaken: string | null;
  recalledMemoryIds: string | null;
  reviewedAt: string | null;
  agentRuns: AgentRun[];
}
interface ActionResult {
  actionType: string;
  executed: boolean;
  mode: "AUTO" | "GUARDED" | "NOOP";
  entityCreated?: { type: string; id: string };
  error?: string;
}
interface Memory {
  id: string;
  category: string;
  subject: string | null;
  content: string;
  contentAr: string | null;
  confidence: number;
  reinforcements: number;
  contradictions: number;
  usedCount: number;
  status: string;
  createdAt: string;
}
interface MemoryCategoryStat { category: string; _count: { _all: number }; _avg: { confidence: number | null } }

const STATUS_STYLES: Record<string, string> = {
  THINKING:  "border-primary/40 text-primary",
  COMPLETED: "border-risk-low/40 text-risk-low",
  FAILED:    "border-destructive/40 text-destructive",
  CANCELLED: "border-muted/40 text-muted-foreground",
};

export function BrainConsole() {
  const [tab, setTab] = useState<"sessions" | "memories" | "trigger">("sessions");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memCategories, setMemCategories] = useState<MemoryCategoryStat[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [memTotals, setMemTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    const [s, m] = await Promise.all([
      fetch("/api/brain/sessions?limit=30").then((r) => r.json()),
      fetch("/api/brain/memory?status=ACTIVE").then((r) => r.json()),
    ]);
    if (s.ok) { setSessions(s.data.sessions); setTotals(s.data.totals ?? {}); }
    if (m.ok) {
      setMemories(m.data.memories);
      setMemTotals(m.data.totals ?? {});
      setMemCategories(m.data.byCategory ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 15_000);
    return () => window.clearInterval(i);
  }, []);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Total Sessions" value={(totals.THINKING ?? 0) + (totals.COMPLETED ?? 0) + (totals.FAILED ?? 0)} icon={Brain} tone="info" />
        <Kpi label="Thinking Now" value={totals.THINKING ?? 0} icon={Activity} tone="primary" />
        <Kpi label="Active Memories" value={memTotals.ACTIVE ?? 0} icon={Database} tone="success" />
        <Kpi label="Archived" value={memTotals.ARCHIVED ?? 0} icon={Database} tone="muted" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/40">
        {(["sessions", "memories", "trigger"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "sessions" ? "Brain Sessions" : t === "memories" ? "Memory" : "Run a Thought"}
          </button>
        ))}
      </div>

      {tab === "sessions" && (
        <SessionsTab sessions={sessions} loading={loading} expanded={expanded} setExpanded={setExpanded} onReload={load} />
      )}
      {tab === "memories" && (
        <MemoriesTab memories={memories} categories={memCategories} reload={() => startTransition(load)} />
      )}
      {tab === "trigger" && <TriggerTab onTriggered={load} />}
    </div>
  );
}

// ───── Sessions ─────

function SessionsTab({
  sessions, loading, expanded, setExpanded, onReload,
}: { sessions: Session[]; loading: boolean; expanded: string | null; setExpanded: (id: string | null) => void; onReload: () => void }) {
  if (loading && sessions.length === 0) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (sessions.length === 0) {
    return <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No brain sessions yet. Try the &ldquo;Run a Thought&rdquo; tab.</CardContent></Card>;
  }
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} expanded={expanded === s.id}
          setExpanded={setExpanded} onReload={onReload} />
      ))}
    </div>
  );
}

function SessionCard({
  s, expanded, setExpanded, onReload,
}: { s: Session; expanded: boolean; setExpanded: (id: string | null) => void; onReload: () => void }) {
  const [feedbackBusy, setFeedbackBusy] = useState<"CORRECT" | "INCORRECT" | null>(null);
  const [execBusy, setExecBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const agents = (() => { try { return JSON.parse(s.agentsConsulted ?? "[]") as string[]; } catch { return []; } })();
  const actions = (() => { try { return JSON.parse(s.actionsRecommended ?? "[]") as Array<{ type: string; description: string; priority?: string }>; } catch { return []; } })();
  const taken = (() => { try { return s.actionsTaken ? JSON.parse(s.actionsTaken) as ActionResult[] : null; } catch { return null; } })();

  const hasContent = s.agentRuns.length > 0 || actions.length > 0;
  const canFeedback = s.status === "COMPLETED" && !s.reviewedAt;
  const canExecute  = s.status === "COMPLETED" && actions.length > 0 && !taken;

  async function sendFeedback(outcome: "CORRECT" | "INCORRECT") {
    setFeedbackBusy(outcome);
    const r = await fetch(`/api/brain/sessions/${s.id}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    const j = await r.json();
    setFeedbackBusy(null);
    if (j.ok) { setToast(`${outcome === "CORRECT" ? "✓ Reinforced" : "✗ Contradicted"} ${j.data.memoriesUpdated} memories`); onReload(); }
    else { setToast("Error: " + (j.error?.message ?? "unknown")); }
    setTimeout(() => setToast(null), 4000);
  }

  async function executeManually() {
    setExecBusy(true);
    const r = await fetch(`/api/brain/sessions/${s.id}/execute-actions`, { method: "POST" });
    const j = await r.json();
    setExecBusy(false);
    if (j.ok) { setToast(`Executed: ${j.data.autoExecuted} auto, ${j.data.guarded} guarded`); onReload(); }
    else { setToast("Error: " + (j.error?.message ?? "unknown")); }
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <Card className="glass">
      <CardContent className="p-4">
        {/* Header row — click to expand */}
        <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(expanded ? null : s.id)}>
          <Brain className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold">{s.trigger}</span>
              <Badge variant="outline" className="text-[10px]">{s.signalType ?? "?"}</Badge>
              <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[s.status])}>{s.status}</Badge>
              {s.requiresApproval && <Badge variant="outline" className="text-[10px] border-risk-medium/40 text-risk-medium">NEEDS APPROVAL</Badge>}
              {s.reviewedAt && <Badge variant="outline" className="text-[10px] border-risk-low/40 text-risk-low">REVIEWED</Badge>}
              {taken && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  {taken.filter((t) => t.mode === "AUTO" && t.executed).length} auto · {taken.filter((t) => t.mode === "GUARDED").length} guarded
                </Badge>
              )}
              {s.confidence !== null && (
                <Badge variant="outline" className="text-[10px] font-mono">{(s.confidence * 100).toFixed(0)}%</Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                {new Date(s.startedAt).toLocaleString()}
                {s.durationMs && <> · {(s.durationMs / 1000).toFixed(1)}s</>}
                {s.totalTokens > 0 && <> · {s.totalTokens} tok</>}
              </span>
            </div>
            {s.conclusion && <p className="text-sm">{s.conclusion}</p>}
            {s.conclusionAr && <p dir="rtl" className="text-xs text-muted-foreground mt-1">{s.conclusionAr}</p>}
            {agents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {agents.map((a) => (
                  <Badge key={a} variant="outline" className="text-[9px] font-mono">{a}</Badge>
                ))}
              </div>
            )}
          </div>
          {hasContent && (expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />)}
        </div>

        {/* Feedback + Execute buttons */}
        {s.status === "COMPLETED" && (
          <div className="mt-3 pt-3 border-t border-border/20 flex flex-wrap items-center gap-2">
            {canFeedback && (
              <>
                <span className="text-xs text-muted-foreground">Was this correct?</span>
                <Button size="sm" variant="outline"
                  className="h-7 text-[11px] gap-1 border-risk-low/40 hover:bg-risk-low/10"
                  disabled={!!feedbackBusy}
                  onClick={() => sendFeedback("CORRECT")}>
                  {feedbackBusy === "CORRECT" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                  Correct
                </Button>
                <Button size="sm" variant="outline"
                  className="h-7 text-[11px] gap-1 border-destructive/40 hover:bg-destructive/10"
                  disabled={!!feedbackBusy}
                  onClick={() => sendFeedback("INCORRECT")}>
                  {feedbackBusy === "INCORRECT" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
                  Incorrect
                </Button>
              </>
            )}
            {canExecute && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] gap-1 border-primary/40 hover:bg-primary/10 ml-auto"
                disabled={execBusy}
                onClick={executeManually}>
                {execBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Execute actions
              </Button>
            )}
            {toast && (
              <span className="text-xs text-muted-foreground ml-auto">{toast}</span>
            )}
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 space-y-3 pl-8 border-l-2 border-border/30">
            {/* Action execution results */}
            {taken && taken.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Actions Executed</div>
                <ul className="space-y-1">
                  {taken.map((t, i) => (
                    <li key={i} className="text-xs flex items-center gap-2">
                      {t.mode === "NOOP" ? (
                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : t.mode === "GUARDED" ? (
                        <Clock className="h-3 w-3 text-risk-medium shrink-0" />
                      ) : t.executed ? (
                        <CheckCircle2 className="h-3 w-3 text-risk-low shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <Badge variant="outline" className={cn(
                        "text-[9px] font-mono",
                        t.mode === "GUARDED"  ? "border-risk-medium/40 text-risk-medium" :
                        t.mode === "AUTO"     ? "border-risk-low/40 text-risk-low" : ""
                      )}>{t.mode}</Badge>
                      <span className="font-mono">{t.actionType}</span>
                      {t.entityCreated && <span className="text-muted-foreground">→ {t.entityCreated.type} {t.entityCreated.id.slice(-6)}</span>}
                      {t.error && <span className="text-destructive">{t.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended actions (when not yet executed) */}
            {actions.length > 0 && !taken && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recommended Actions</div>
                <ul className="space-y-1">
                  {actions.map((a, i) => (
                    <li key={i} className="text-xs">
                      <Badge variant="outline" className="text-[9px] font-mono mr-1">{a.priority ?? "?"}</Badge>
                      <strong>{a.type}</strong> — {a.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Agent runs */}
            {s.agentRuns.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Agent Runs</div>
                <ul className="space-y-1">
                  {s.agentRuns.map((r) => (
                    <li key={r.id} className="text-xs flex items-center gap-2 font-mono">
                      <Badge variant="outline" className={cn("text-[9px]", STATUS_STYLES[r.status])}>{r.status}</Badge>
                      <span className="font-semibold">{r.agentName}</span>
                      {r.confidence !== null && <span className="text-muted-foreground">{(r.confidence * 100).toFixed(0)}%</span>}
                      {r.durationMs && <span className="text-muted-foreground">· {(r.durationMs / 1000).toFixed(1)}s</span>}
                      <span className="text-muted-foreground">· {r.tokensUsed} tok</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───── Memories ─────

function MemoriesTab({
  memories, categories, reload,
}: { memories: Memory[]; categories: MemoryCategoryStat[]; reload: () => void }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      {categories.length > 0 && (
        <Card className="glass">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Memory categories</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <div key={c.category} className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-xs">
                  <span className="font-mono text-[10px]">{c.category}</span>
                  <span className="ml-2 text-muted-foreground">{c._count._all}</span>
                  {c._avg.confidence !== null && <span className="ml-1 text-[10px] text-primary">({(c._avg.confidence * 100).toFixed(0)}%)</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Active memories ({memories.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Seed memory"}
        </Button>
      </div>

      {showAdd && <AddMemoryForm onDone={() => { setShowAdd(false); reload(); }} />}

      {memories.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No memories yet. The brain starts blank — let it learn from incidents over time, or seed it manually.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Card key={m.id} className="glass">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] font-mono">{m.category}</Badge>
                  {m.subject && <Badge variant="outline" className="text-[10px]">{m.subject}</Badge>}
                  <Badge variant="outline" className="text-[10px] font-mono">{(m.confidence * 100).toFixed(0)}% conf</Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    +{m.reinforcements} / −{m.contradictions} · used {m.usedCount}x
                  </span>
                </div>
                <p className="text-sm">{m.content}</p>
                {m.contentAr && <p dir="rtl" className="text-xs text-muted-foreground mt-1">{m.contentAr}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddMemoryForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ category: "", content: "", contentAr: "", subject: "", confidence: 0.7 });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!form.category || !form.content) return;
    setBusy(true);
    const r = await fetch("/api/brain/memory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category, content: form.content,
        contentAr: form.contentAr || undefined,
        subject: form.subject || undefined,
        confidence: form.confidence,
      }),
    });
    setBusy(false);
    if ((await r.json()).ok) onDone();
  }

  return (
    <Card className="glass border-primary/40">
      <CardContent className="p-4 space-y-2">
        <input
          placeholder="Category (e.g. PIPELINE_LEAK_PATTERN)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
        />
        <input
          placeholder="Subject (optional — site code, contractor, etc.)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
        <textarea
          placeholder="What the brain should remember (English)"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
        <textarea
          dir="rtl"
          placeholder="بالعربية (اختياري)"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.contentAr} onChange={(e) => setForm({ ...form, contentAr: e.target.value })}
        />
        <div className="flex items-center gap-2 text-sm">
          <span>Confidence:</span>
          <input type="range" min="0" max="1" step="0.05" value={form.confidence}
            onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
            className="flex-1" />
          <span className="font-mono w-12">{(form.confidence * 100).toFixed(0)}%</span>
        </div>
        <Button onClick={submit} disabled={busy || !form.category || !form.content}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add memory
        </Button>
      </CardContent>
    </Card>
  );
}

// ───── Trigger ─────

function TriggerTab({ onTriggered }: { onTriggered: () => void }) {
  const [form, setForm] = useState({ type: "MANUAL_QUERY", trigger: "", payload: "{}" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const payload = JSON.parse(form.payload || "{}");
      const r = await fetch("/api/brain/think", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, trigger: form.trigger, payload }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error?.message ?? "Failed"); return; }
      setResult(j.data);
      onTriggered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bad JSON in payload");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Wake the brain
        </CardTitle>
        <CardDescription>Send a signal directly to the orchestrator. Useful for testing cross-domain reasoning.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Signal type</label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {["MANUAL_QUERY", "PIPELINE_ANOMALY", "PERMIT_NEW", "WELLNESS_ALERT", "VISION_DETECTION", "SENSOR_ANOMALY", "INCIDENT", "SCHEDULED_REVIEW"].map((t) =>
              <option key={t} value={t}>{t}</option>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Trigger (free-text description)</label>
          <input
            placeholder='e.g. "Check pipeline KHZ-001 with active permit and worker nearby"'
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.trigger}
            onChange={(e) => setForm({ ...form, trigger: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Payload JSON (optional)</label>
          <textarea
            placeholder='{"pipelineId":"...","workerId":"..."}'
            rows={3}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            value={form.payload}
            onChange={(e) => setForm({ ...form, payload: e.target.value })}
          />
        </div>
        <Button onClick={run} disabled={busy || !form.trigger}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Think
        </Button>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> {error}
          </div>
        )}
        {result && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-primary mb-1">Brain Decision</div>
              <p className="text-sm">{String(result.conclusion ?? "")}</p>
              {result.conclusionAr ? <p dir="rtl" className="text-xs text-muted-foreground mt-1">{String(result.conclusionAr)}</p> : null}
              <div className="mt-2 text-xs text-muted-foreground">
                Confidence: {((Number(result.confidence ?? 0)) * 100).toFixed(0)}% ·
                Agents: {(result.agentsConsulted as string[] ?? []).join(", ")} ·
                {String(result.durationMs ?? 0)}ms ·
                {String(result.totalTokens ?? 0)} tok
              </div>
              {result.actionsExecuted
                ? <ActionsExecutedBadge data={result.actionsExecuted as { autoExecuted: number; guarded: number; noops: number }} />
                : null
              }
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

// ───── Helpers ─────

function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof Brain;
  tone: "info" | "success" | "primary" | "muted";
}) {
  const styles = {
    info: "border-border/50 text-foreground",
    success: "border-risk-low/40 text-risk-low",
    primary: "border-primary/40 text-primary",
    muted: "border-muted/40 text-muted-foreground",
  };
  return (
    <Card className={cn("glass border", styles[tone])}>
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

function ActionsExecutedBadge({ data }: { data: { autoExecuted: number; guarded: number; noops: number } }) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
      <Zap className="h-3 w-3 text-primary" />
      Actions: {data.autoExecuted} auto | {data.guarded} pending | {data.noops} no-op
    </div>
  );
}
