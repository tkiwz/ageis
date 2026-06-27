"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { playSound } from "@/lib/sound";

interface RecentIncident {
  id: string;
  incidentNumber: string;
  title: string;
  severity: string;
  status: string;
}

export function RetrospectiveForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [incidents, setIncidents] = useState<RecentIncident[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [howToPrevent, setHowToPrevent] = useState("");
  const [keyLearning, setKeyLearning] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/incidents?status=RESOLVED&limit=20", { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setIncidents(j.data.incidents ?? []);
      } catch { /* ignore */ }
    })();
  }, []);

  async function submit() {
    if (!keyLearning || keyLearning.trim().length < 10) {
      setResult({ ok: false, message: "Write at least the key learning." });
      return;
    }
    // Compose a structured raw content the Claude distiller can chew on
    const composed = [
      selectedId ? `Linked incident: ${selectedId}` : "",
      whatHappened ? `WHAT HAPPENED:\n${whatHappened}` : "",
      rootCause ? `ROOT CAUSE:\n${rootCause}` : "",
      howToPrevent ? `PREVENTIVE CONTROLS:\n${howToPrevent}` : "",
      `KEY LEARNING:\n${keyLearning}`,
    ].filter(Boolean).join("\n\n");

    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/knowledge/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "INCIDENT_RETRO",
          rawContent: composed,
          contextType: selectedId ? "incident" : undefined,
          contextId: selectedId || undefined,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        playSound(j.data.suggestionId ? "siren" : "success");
        setResult({
          ok: true,
          message: j.data.suggestionId
            ? "🚨 CRITICAL escalated — two-key confirmation required."
            : "Retrospective added to review queue.",
        });
        setSelectedId("");
        setWhatHappened("");
        setRootCause("");
        setHowToPrevent("");
        setKeyLearning("");
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
        <FileText className="h-4 w-4 text-primary" />
        <strong>Incident retrospective</strong>
        <span className="text-muted-foreground text-xs">— turn a closed incident into a brain learning</span>
      </div>

      <div>
        <Label className="text-xs">Link to a resolved incident (optional)</Label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— manual / not linked —</option>
          {incidents.map((i) => (
            <option key={i.id} value={i.id}>
              {i.incidentNumber} · {i.severity} · {i.title.slice(0, 50)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3">
        <Field
          label="What happened? (1-2 sentences)"
          placeholder="e.g. Flange leak at FT-201 caused 2-hour shutdown of pipeline KHZ-001"
          value={whatHappened}
          onChange={setWhatHappened}
          disabled={busy}
          rows={2}
        />
        <Field
          label="Root cause? (what really caused it)"
          placeholder="e.g. Gasket aged beyond 24-month replacement interval; preventive maintenance ticket missed in scheduler"
          value={rootCause}
          onChange={setRootCause}
          disabled={busy}
          rows={3}
        />
        <Field
          label="Preventive controls — what should have caught this?"
          placeholder="e.g. Add a 22-month-warning trigger to maintenance scheduler for all flange gaskets"
          value={howToPrevent}
          onChange={setHowToPrevent}
          disabled={busy}
          rows={3}
        />
        <Field
          label={<><span>★ Key learning</span> <span className="text-muted-foreground text-xs">— the one thing the AI should remember forever</span></>}
          placeholder="e.g. In hot-climate sites, flange gaskets degrade 25% faster than vendor MTBF; treat all rated ≥18 months as risk after 14 months"
          value={keyLearning}
          onChange={setKeyLearning}
          disabled={busy}
          rows={3}
          required
        />
      </div>

      <Button onClick={submit} disabled={busy || keyLearning.trim().length < 10}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Submit retrospective
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
        💡 <strong>Tip:</strong> The Key Learning is the most important field. Write it as a rule the AI can apply:
        &ldquo;When X happens, expect Y&rdquo; or &ldquo;Watch for A in conditions B&rdquo;.
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, rows, disabled, required }: {
  label: React.ReactNode; placeholder: string;
  value: string; onChange: (v: string) => void;
  rows: number; disabled?: boolean; required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}{required && <span className="text-destructive">*</span>}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
