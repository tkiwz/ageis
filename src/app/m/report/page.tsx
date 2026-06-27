"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Check, WifiOff } from "lucide-react";
import { tryOrQueue } from "@/lib/offline-queue";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type IncidentType = "FIRE" | "GAS_LEAK" | "INJURY" | "PIPELINE_LEAK" | "NEAR_MISS" | "EQUIPMENT_FAILURE" | "OTHER";

const TYPES: { id: IncidentType; label: string; labelAr: string; emoji: string }[] = [
  { id: "FIRE",              label: "Fire",            labelAr: "حريق",          emoji: "🔥" },
  { id: "GAS_LEAK",          label: "Gas leak",        labelAr: "تسرّب غاز",     emoji: "💨" },
  { id: "INJURY",            label: "Injury",          labelAr: "إصابة",         emoji: "🩹" },
  { id: "EQUIPMENT_FAILURE", label: "Equipment fail",  labelAr: "عطل معدات",     emoji: "⚙️" },
  { id: "NEAR_MISS",         label: "Near miss",       labelAr: "حادث وشيك",     emoji: "⚠️" },
  { id: "OTHER",             label: "Other",           labelAr: "أخرى",          emoji: "📝" },
];

const SEVERITIES: { id: Severity; label: string; color: string }[] = [
  { id: "LOW", label: "Low", color: "border-risk-low/40 text-risk-low" },
  { id: "MEDIUM", label: "Medium", color: "border-risk-medium/40 text-risk-medium" },
  { id: "HIGH", label: "High", color: "border-risk-high/40 text-risk-high" },
  { id: "CRITICAL", label: "Critical", color: "border-destructive/40 text-destructive" },
];

export default function QuickReportPage() {
  const [type, setType] = useState<IncidentType | null>(null);
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "online" | "offline">("idle");

  async function submit() {
    if (!type) return;
    setState("submitting");

    // Use voice/parse with an explicit ACTION intent — server handles it
    const text = `report incident type ${type} severity ${severity}${location ? ` at ${location}` : ""}: ${description || "Mobile quick report"}`;
    const res = await tryOrQueue("/api/voice/parse", "POST", {
      transcript: text,
      lang: "en",
      sessionId: "mobile-report",
    });
    setState(res.online ? "online" : "offline");
  }

  if (state === "online" || state === "offline") {
    return (
      <div className="flex min-h-[calc(100vh-180px)] flex-col items-center justify-center gap-4 text-center">
        <Check className="h-16 w-16 text-risk-low" />
        <h1 className="font-display text-2xl">Reported</h1>
        <p className="text-sm text-muted-foreground">Thanks for keeping the site safe.</p>
        {state === "offline" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" /> Saved offline — will sync soon
          </div>
        )}
        <button onClick={() => { setState("idle"); setType(null); setDescription(""); setLocation(""); }} className="mt-6 underline text-sm">
          Report another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-5 w-5 text-risk-medium" />
          <h1 className="font-display text-2xl">Quick incident report</h1>
        </div>
        <p dir="rtl" className="text-sm text-muted-foreground">بلاغ سريع عن حادثة</p>
      </div>

      <section>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">What happened?</div>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 active:scale-95 transition-transform ${type === t.id ? "border-primary bg-primary/10" : "border-border/40"}`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="text-xs">{t.label}</span>
              <span dir="rtl" className="text-[10px] text-muted-foreground">{t.labelAr}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Severity</div>
        <div className="grid grid-cols-4 gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeverity(s.id)}
              className={`rounded-lg border-2 py-2 text-xs font-medium ${severity === s.id ? `${s.color} bg-current/10` : "border-border/40 text-muted-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Location (optional)</div>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Block 60, Compressor C-3, ..."
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base"
        />
      </section>

      <section>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Description</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did you see?"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base"
        />
      </section>

      <button
        onClick={submit}
        disabled={!type || state === "submitting"}
        className="w-full rounded-full bg-primary py-4 text-base font-bold text-primary-foreground active:scale-95 transition-transform disabled:opacity-50"
      >
        {state === "submitting" ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Submit report"}
      </button>
    </div>
  );
}
