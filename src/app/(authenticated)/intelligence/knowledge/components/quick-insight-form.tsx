"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { playSound } from "@/lib/sound";

const PLACEHOLDER = `Example:
"At Block 60 wellheads, when ambient temperature exceeds 47°C and wind is below 5 km/h, gasket failures on Tag X-100 series increase. I've seen this 4 times in 3 years."

Or in Arabic:
"في حقل خزان، لاحظت أن صمامات الـ Tag P-310 تفشل عادة بعد 18 شهراً من التشغيل المستمر..."`;

export function QuickInsightForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [text, setText] = useState("");
  const [contextType, setContextType] = useState("");
  const [contextId, setContextId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; suggestionId?: string } | null>(null);

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
          contextType: contextType || undefined,
          contextId: contextId || undefined,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        playSound(j.data.autoApplied ? "siren" : "success");
        const msg = j.data.suggestionId
          ? "🚨 CRITICAL — Two managers must confirm in 5 minutes!"
          : j.data.autoApplied
            ? "Auto-applied to brain."
            : "Submitted! Awaiting HSSE review.";
        setResult({ ok: true, message: msg, suggestionId: j.data.suggestionId });
        setText("");
        setContextType("");
        setContextId("");
        onSubmitted();
      } else {
        playSound("error");
        setResult({ ok: false, message: j.error?.message ?? "Failed" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <MessageCircle className="h-4 w-4 text-primary" />
        <strong>Quick insight</strong>
        <span className="text-muted-foreground text-xs">— write naturally; AI structures it</span>
      </div>

      <textarea
        placeholder={PLACEHOLDER}
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
        disabled={busy}
      />
      <div className="text-[10px] text-muted-foreground text-right">
        {text.length} / 8000
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Context type (optional)</Label>
          <select
            value={contextType}
            onChange={(e) => setContextType(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={busy}
          >
            <option value="">—</option>
            <option value="incident">Incident</option>
            <option value="permit">Permit</option>
            <option value="pipeline">Pipeline</option>
            <option value="site">Site</option>
            <option value="equipment">Equipment</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Context ID (optional)</Label>
          <Input
            placeholder="e.g. KHZ-001"
            value={contextId}
            onChange={(e) => setContextId(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <Button onClick={submit} disabled={busy || text.trim().length < 10}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit insight"}
      </Button>

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

      <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
        💡 <strong>Tip:</strong> Be specific. Include site codes, equipment tags, exact conditions
        (temperature, pressure, time of day). The more concrete you are, the better the brain learns.
      </div>
    </div>
  );
}
