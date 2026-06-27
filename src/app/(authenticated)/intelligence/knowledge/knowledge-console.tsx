"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, MessageCircle, Upload, FileText, Mic, Loader2, AlertTriangle,
  Check, X, Clock, Sparkles, ShieldAlert, KeyRound, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";
import { QuickInsightForm } from "./components/quick-insight-form";
import { DocumentUploadForm } from "./components/document-upload-form";
import { RetrospectiveForm } from "./components/retrospective-form";
import { VoiceMemoForm } from "./components/voice-memo-form";

interface Contribution {
  id: string; source: string; rawContent: string;
  structuredContent: string | null; severity: string; status: string;
  contextType: string | null; contextId: string | null;
  contributorId: string; fileName: string | null;
  createdAt: string;
  contributor: { id: string; name: string; email: string; role: string } | null;
  autoEscalatedTo: string | null;
  resultingMemoryIds: string | null;
}

interface Stats {
  pending: number; autoApplied: number; approved: number; rejected: number; total: number;
}

const SEV_STYLES: Record<string, string> = {
  LOW: "border-risk-low/40 text-risk-low",
  MEDIUM: "border-risk-medium/40 text-risk-medium",
  HIGH: "border-risk-high/40 text-risk-high",
  CRITICAL: "border-destructive/50 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending AI",
  AI_PROCESSED: "Awaiting review",
  AUTO_APPLIED: "Two-key pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export function KnowledgeConsole() {
  const [tab, setTab] = useState<"submit" | "review" | "experts">("submit");
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, autoApplied: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filter !== "ALL") params.set("status", filter);
        const r = await fetch(`/api/knowledge/contributions?${params}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) {
          setContributions(j.data.contributions ?? []);
          setStats(j.data.stats ?? stats);
        }
      } finally { setLoading(false); }
    });
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 20_000);
    return () => window.clearInterval(i);
  }, [filter]);

  async function review(id: string, verdict: "APPROVE" | "REJECT") {
    setActing(id);
    try {
      const r = await fetch(`/api/knowledge/contributions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      const j = await r.json();
      if (j.ok) {
        playSound(verdict === "APPROVE" ? "success" : "click");
        load();
      } else {
        playSound("error");
        alert(j.error?.message ?? "Failed");
      }
    } finally {
      setActing(null);
    }
  }

  async function criticalConfirm(suggestionId: string, action: "CONFIRM" | "REJECT") {
    setActing(suggestionId);
    try {
      const r = await fetch(`/api/knowledge/critical-confirm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId, action }),
      });
      const j = await r.json();
      if (j.ok) {
        if (j.data.status === "EXECUTED") playSound("success");
        else if (j.data.status === "AWAITING_SECOND_KEY") playSound("info");
        else playSound("click");
        alert(j.data.message ?? "Done");
        load();
      } else {
        playSound("error");
        alert(j.error?.message ?? "Failed");
      }
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={Clock} label="Awaiting review" value={stats.pending} tone="warning" />
        <Kpi icon={ShieldAlert} label="Two-key pending" value={stats.autoApplied} tone="critical" />
        <Kpi icon={Check} label="Approved" value={stats.approved} tone="success" />
        <Kpi icon={BookOpen} label="Total contributions" value={stats.total} tone="info" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/40">
        {(["submit", "review", "experts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "submit" ? "✍ Submit knowledge" : t === "review" ? `📋 Review queue (${stats.pending + stats.autoApplied})` : "🏆 Experts"}
          </button>
        ))}
      </div>

      {tab === "submit" && <SubmitTab onSubmitted={load} />}

      {tab === "review" && (
        <ReviewTab
          contributions={contributions}
          loading={loading}
          filter={filter}
          setFilter={setFilter}
          acting={acting}
          onApprove={(id) => review(id, "APPROVE")}
          onReject={(id) => review(id, "REJECT")}
          onCriticalConfirm={criticalConfirm}
        />
      )}

      {tab === "experts" && <ExpertsTab />}
    </div>
  );
}

// ───── Submit Tab ─────

function SubmitTab({ onSubmitted }: { onSubmitted: () => void }) {
  const [method, setMethod] = useState<"quick" | "voice" | "retro" | "doc">("quick");
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <MethodCard
          active={method === "quick"}
          onClick={() => setMethod("quick")}
          icon={MessageCircle}
          title="Quick insight"
          desc="Type a free-form observation"
        />
        <MethodCard
          active={method === "voice"}
          onClick={() => setMethod("voice")}
          icon={Mic}
          title="Voice memo"
          desc="Speak; we'll transcribe"
        />
        <MethodCard
          active={method === "retro"}
          onClick={() => setMethod("retro")}
          icon={FileText}
          title="Incident retrospective"
          desc="Structured post-incident form"
        />
        <MethodCard
          active={method === "doc"}
          onClick={() => setMethod("doc")}
          icon={Upload}
          title="Document upload"
          desc="PDF/text report"
        />
      </div>

      <Card className="glass">
        <CardContent className="p-4">
          {method === "quick" && <QuickInsightForm onSubmitted={onSubmitted} />}
          {method === "voice" && <VoiceMemoForm onSubmitted={onSubmitted} />}
          {method === "retro" && <RetrospectiveForm onSubmitted={onSubmitted} />}
          {method === "doc" && <DocumentUploadForm onSubmitted={onSubmitted} />}
        </CardContent>
      </Card>
    </div>
  );
}

function MethodCard({ active, onClick, icon: Icon, title, desc }: {
  active: boolean; onClick: () => void; icon: typeof MessageCircle; title: string; desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border-2 p-3 text-left transition-all active:scale-[0.99]",
        active ? "border-primary bg-primary/10" : "border-border/40 hover:border-border",
      )}
    >
      <Icon className={cn("h-5 w-5 mb-1", active ? "text-primary" : "text-muted-foreground")} />
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
    </button>
  );
}

// ───── Review Tab ─────

function ReviewTab({
  contributions, loading, filter, setFilter, acting, onApprove, onReject, onCriticalConfirm,
}: {
  contributions: Contribution[];
  loading: boolean;
  filter: string;
  setFilter: (v: string) => void;
  acting: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCriticalConfirm: (suggestionId: string, action: "CONFIRM" | "REJECT") => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {["ALL", "AI_PROCESSED", "AUTO_APPLIED", "APPROVED", "REJECTED"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : STATUS_LABEL[f] ?? f}
          </Button>
        ))}
      </div>

      {loading && contributions.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contributions.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No contributions yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {contributions.map((c) => (
            <ContributionCard
              key={c.id}
              c={c}
              acting={acting === c.id}
              onApprove={() => onApprove(c.id)}
              onReject={() => onReject(c.id)}
              onCriticalConfirm={onCriticalConfirm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContributionCard({
  c, acting, onApprove, onReject, onCriticalConfirm,
}: {
  c: Contribution; acting: boolean;
  onApprove: () => void; onReject: () => void;
  onCriticalConfirm: (suggestionId: string, action: "CONFIRM" | "REJECT") => void;
}) {
  let structured: { category?: string; subject?: string; content?: string; contentAr?: string; immediateAction?: string; immediateActionAr?: string; severity?: string; confidence?: number } | null = null;
  try { structured = c.structuredContent ? JSON.parse(c.structuredContent) : null; } catch { /* ignore */ }
  let escalation: { aiSuggestionId?: string; requiresTwoKeys?: boolean } | null = null;
  try { escalation = c.autoEscalatedTo ? JSON.parse(c.autoEscalatedTo) : null; } catch { /* ignore */ }

  const isCritical = c.severity === "CRITICAL" && escalation?.requiresTwoKeys;

  return (
    <Card className={cn("glass border-l-4", SEV_STYLES[c.severity]?.split(" ")[0] ?? "")}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className={SEV_STYLES[c.severity]}>{c.severity}</Badge>
          <Badge variant="outline" className="text-[10px] font-mono">{c.source}</Badge>
          <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[c.status] ?? c.status}</Badge>
          {isCritical && (
            <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
              <KeyRound className="mr-1 h-2.5 w-2.5" /> NEEDS 2 KEYS
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(c.createdAt).toLocaleString()} · by {c.contributor?.name ?? "Unknown"}
          </span>
        </div>

        {/* Raw content (collapsed) */}
        <div className="mb-2 rounded-md border border-border/30 bg-muted/20 px-3 py-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Original contribution</div>
          <div className="line-clamp-3">{c.rawContent}</div>
        </div>

        {/* AI structured */}
        {structured && (
          <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> AI distillation
              {structured.confidence !== undefined && (
                <span className="ml-auto font-mono text-[10px]">{(structured.confidence * 100).toFixed(0)}% conf</span>
              )}
            </div>
            <div><strong>{structured.category}</strong>{structured.subject ? ` · ${structured.subject}` : ""}</div>
            <p className="mt-1">{structured.content}</p>
            {structured.contentAr && <p dir="rtl" className="mt-0.5 text-xs text-muted-foreground">{structured.contentAr}</p>}
            {isCritical && structured.immediateAction && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Immediate action
                </div>
                <div className="text-sm font-semibold">{structured.immediateAction}</div>
                {structured.immediateActionAr && <div dir="rtl" className="text-xs">{structured.immediateActionAr}</div>}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {c.status === "AI_PROCESSED" && !isCritical && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onApprove} disabled={acting}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Approve → add to brain
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={acting}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        )}

        {c.status === "AI_PROCESSED" && isCritical && escalation?.aiSuggestionId && (
          <div className="space-y-2">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              ⚠ This is CRITICAL — requires <strong>two different managers</strong> to confirm within 5 minutes.
              Memory is NOT added to the brain until both keys are turned.
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onCriticalConfirm(escalation!.aiSuggestionId!, "CONFIRM")}
                disabled={acting}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Turn my key (CONFIRM)
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCriticalConfirm(escalation!.aiSuggestionId!, "REJECT")} disabled={acting}>
                <X className="h-3.5 w-3.5" /> Reject critical
              </Button>
            </div>
          </div>
        )}

        {c.status === "AUTO_APPLIED" && (
          <div className="rounded-md border border-risk-low/40 bg-risk-low/5 px-3 py-2 text-xs text-risk-low">
            ✓ Applied to brain. Memory: {c.resultingMemoryIds}
          </div>
        )}
        {c.status === "REJECTED" && (
          <div className="text-xs text-muted-foreground">✕ Rejected</div>
        )}
        {c.status === "APPROVED" && (
          <div className="text-xs text-risk-low">✓ Approved</div>
        )}
      </CardContent>
    </Card>
  );
}

// ───── Experts Tab ─────

function ExpertsTab() {
  const [experts, setExperts] = useState<Array<{ id: string; userId: string; contributionsCount: number; acceptedCount: number; rejectedCount: number; trustWeight: number }>>([]);
  const [users, setUsers] = useState<Record<string, { name: string; email: string; role: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Borrow from contributions API and aggregate client-side
        const r = await fetch("/api/knowledge/contributions?limit=200", { cache: "no-store" });
        const j = await r.json();
        if (!j.ok) return;
        const map: Record<string, { name: string; email: string; role: string }> = {};
        for (const c of j.data.contributions ?? []) {
          if (c.contributor) map[c.contributor.id] = {
            name: c.contributor.name,
            email: c.contributor.email,
            role: c.contributor.role,
          };
        }
        setUsers(map);

        // We don't have a dedicated experts endpoint — derive from contribution counts
        const counts: Record<string, { contributions: number; approved: number; rejected: number }> = {};
        for (const c of j.data.contributions ?? []) {
          if (!counts[c.contributorId]) counts[c.contributorId] = { contributions: 0, approved: 0, rejected: 0 };
          counts[c.contributorId].contributions++;
          if (c.status === "APPROVED" || c.status === "AUTO_APPLIED") counts[c.contributorId].approved++;
          if (c.status === "REJECTED") counts[c.contributorId].rejected++;
        }
        const list = Object.entries(counts).map(([uid, c]) => ({
          id: uid,
          userId: uid,
          contributionsCount: c.contributions,
          acceptedCount: c.approved,
          rejectedCount: c.rejected,
          trustWeight: c.contributions === 0 ? 0.5 : Math.min(0.95, (c.approved + 5 * 0.5) / (c.approved + c.rejected + 5)),
        })).sort((a, b) => b.contributionsCount - a.contributionsCount);
        setExperts(list);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : experts.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No contributors yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {experts.map((e, idx) => {
            const u = users[e.userId];
            return (
              <Card key={e.id} className="glass">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-6 text-center font-bold text-muted-foreground">{idx + 1}</div>
                  {idx === 0 && <Trophy className="h-5 w-5 text-risk-medium" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{u?.name ?? e.userId}</div>
                    <div className="text-[10px] text-muted-foreground">{u?.email} · {u?.role}</div>
                  </div>
                  <Badge variant="outline">{e.contributionsCount} contributions</Badge>
                  <Badge variant="outline" className="text-risk-low border-risk-low/40">{e.acceptedCount} approved</Badge>
                  <Badge variant="outline" className="font-mono">
                    Trust {(e.trustWeight * 100).toFixed(0)}%
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof BookOpen; label: string; value: number;
  tone: "warning" | "critical" | "success" | "info";
}) {
  const tones = {
    warning: "border-risk-medium/40 text-risk-medium",
    critical: "border-destructive/40 text-destructive",
    success: "border-risk-low/40 text-risk-low",
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
