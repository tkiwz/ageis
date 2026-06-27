"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, Loader2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  proposedAction: string;
  severity: string | null;
  confidence: number;
  reasoning: string | null;
  reasoningAr: string | null;
  aiAnalysis: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  metadata: string | null;
}

const SEV_STYLES: Record<string, string> = {
  LOW: "border-risk-low/40 text-risk-low",
  MEDIUM: "border-risk-medium/40 text-risk-medium",
  HIGH: "border-risk-high/40 text-risk-high",
  CRITICAL: "border-destructive/50 text-destructive",
};

export default function AISuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "EXECUTED" | "REJECTED">("PENDING");
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      const r = await fetch(`/api/intelligence/suggestions?status=${filter}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        const list: Suggestion[] = Array.isArray(j.data) ? j.data : (j.data?.suggestions ?? []);
        setItems(list);
      }
    });
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [filter]);

  async function review(id: string, action: "APPROVE" | "REJECT") {
    setBusy(id);
    try {
      await fetch("/api/intelligence/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" /> AI Suggestions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Low-confidence AI findings that require human approval before any side-effect runs.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">اقتراحات الذكاء الاصطناعي قبل التنفيذ</span>
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(["PENDING", "EXECUTED", "REJECTED"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card className="glass">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No {filter.toLowerCase()} suggestions.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s) => {
            const meta = s.metadata ? JSON.parse(s.metadata) : {};
            const expiringIn = s.expiresAt
              ? Math.max(0, Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 60_000))
              : null;
            return (
              <Card key={s.id} className={cn("border-l-4", s.severity ? SEV_STYLES[s.severity]?.split(" ")[0] : "")}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{s.type.replace(/_/g, " ")}</Badge>
                    {s.severity && (
                      <Badge variant="outline" className={SEV_STYLES[s.severity]}>{s.severity}</Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {(s.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                    {expiringIn !== null && expiringIn < 60 && (
                      <Badge variant="outline" className="text-risk-medium border-risk-medium/40">
                        <Clock className="mr-1 h-3 w-3" />
                        expires in {expiringIn}m
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-base">
                    {meta.pipelineCode ? `Pipeline ${meta.pipelineCode}` : s.subjectType}
                  </CardTitle>
                  <CardDescription>{s.proposedAction.replace(/_/g, " ")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {s.reasoning && (
                    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm">
                      <span className="text-primary font-semibold">AI Reasoning:</span>{" "}
                      {s.reasoning}
                    </div>
                  )}
                  {s.reasoningAr && (
                    <div dir="rtl" className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                      {s.reasoningAr}
                    </div>
                  )}

                  {s.status === "PENDING" && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => review(s.id, "APPROVE")}
                        disabled={busy === s.id}
                      >
                        {busy === s.id
                          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          : <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
                        Approve & Execute
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review(s.id, "REJECT")}
                        disabled={busy === s.id}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  )}
                  {s.status === "EXECUTED" && (
                    <div className="flex items-center gap-1 text-xs text-risk-low">
                      <Check className="h-3.5 w-3.5" /> Approved & cascade executed
                    </div>
                  )}
                  {s.status === "REJECTED" && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <X className="h-3.5 w-3.5" /> Rejected
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
