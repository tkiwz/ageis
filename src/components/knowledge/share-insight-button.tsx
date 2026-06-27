"use client";

/**
 * Reusable "Share insight" button + modal — drop it into any detail page
 * (incident, permit, pipeline, site, equipment).
 *
 * Usage:
 *   <ShareInsightButton contextType="incident" contextId={incident.id} />
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { playSound } from "@/lib/sound";

interface Props {
  contextType: "incident" | "permit" | "pipeline" | "site" | "equipment";
  contextId: string;
  /** Optional small button style instead of full */
  compact?: boolean;
}

export function ShareInsightButton({ contextType, contextId, compact }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Lightbulb className="h-4 w-4 text-risk-medium" />
        {compact ? "Share insight" : "Share an insight about this"}
      </Button>

      {open && (
        <ShareInsightModal
          contextType={contextType}
          contextId={contextId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareInsightModal({
  contextType, contextId, onClose,
}: { contextType: string; contextId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit() {
    if (text.trim().length < 10) {
      setResult({ ok: false, message: "Please write at least a sentence." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/knowledge/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "QUICK_INSIGHT",
          rawContent: text,
          contextType,
          contextId,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        playSound(j.data.suggestionId ? "siren" : "success");
        setResult({
          ok: true,
          message: j.data.suggestionId
            ? "🚨 CRITICAL escalated — two managers must confirm in 5 minutes."
            : "Insight added — HSSE will review.",
        });
        setText("");
        setTimeout(onClose, 2500);
      } else {
        playSound("error");
        setResult({ ok: false, message: j.error?.message ?? "Failed" });
      }
    } catch (err) {
      playSound("error");
      setResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-risk-medium" />
              Share an insight
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Linked to {contextType} <code className="font-mono">{contextId}</code>
              <br />
              💡 Tell the brain something you noticed — patterns, recurring issues, expert observations.
              CRITICAL findings escalate immediately to HSSE managers.
            </div>

            <textarea
              autoFocus
              placeholder={
                contextType === "incident"
                  ? "e.g. This is the 3rd time we see flange leaks at FT-201 in summer. The gasket vendor's MTBF is 24 months but in this climate it's closer to 14."
                  : contextType === "permit"
                  ? "e.g. This hot-work permit overlaps with active confined-space work on the same level. Need vertical separation enforcement."
                  : "e.g. Pattern I've noticed at this site/equipment/contractor that the AI should remember…"
              }
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{text.length} / 8000 chars</span>
              <Button onClick={submit} disabled={busy || text.trim().length < 10}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                Submit insight
              </Button>
            </div>

            {result && (
              <div className={
                result.ok
                  ? "flex items-center gap-2 rounded-md border border-risk-low/40 bg-risk-low/5 px-3 py-2 text-sm text-risk-low"
                  : "flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }>
                {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {result.message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
