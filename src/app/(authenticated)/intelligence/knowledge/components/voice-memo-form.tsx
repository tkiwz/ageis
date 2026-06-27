"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Loader2, CheckCircle2, AlertCircle, Volume2 } from "lucide-react";
import { playSound } from "@/lib/sound";
import { getSecureContextStatus } from "@/lib/secure-context";

type ListenState = "idle" | "listening" | "review" | "uploading";

// Minimal Web Speech API types
interface SpeechResultEvent { results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const LANGS = [
  { code: "en-US", label: "English" },
  { code: "ar-SA", label: "العربية" },
  { code: "ur-PK", label: "اردو" },
  { code: "ne-NP", label: "नेपाली" },
];

export function VoiceMemoForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [state, setState] = useState<ListenState>("idle");
  const [transcript, setTranscript] = useState("");
  const [lang, setLang] = useState("en-US");
  const [contextType, setContextType] = useState("");
  const [contextId, setContextId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (e) => {
      let full = "";
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript;
      }
      setTranscript(full);
    };
    r.onerror = (e) => {
      setError(`Speech error: ${e.error}`);
      setState("idle");
      playSound("error");
    };
    r.onend = () => {
      setState((s) => (s === "listening" ? "review" : s));
    };
    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch { /* noop */ }
    };
  }, [lang]);

  function start() {
    const ctx = getSecureContextStatus();
    if (!ctx.secure) {
      setError(ctx.suggestion);
      playSound("error");
      return;
    }
    setError(null);
    setResult(null);
    setTranscript("");
    try {
      recognitionRef.current?.start();
      setState("listening");
      playSound("voice-ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    }
  }

  function stop() {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setState("review");
  }

  async function submit() {
    if (transcript.trim().length < 10) {
      setError("Recording too short");
      return;
    }
    setState("uploading");
    setError(null);
    try {
      const r = await fetch("/api/knowledge/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "VOICE_MEMO",
          rawContent: transcript,
          transcript,
          language: lang,
          contextType: contextType || undefined,
          contextId: contextId || undefined,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        playSound(j.data.suggestionId ? "siren" : "success");
        setResult({
          ok: true,
          message: j.data.suggestionId
            ? "🚨 CRITICAL — two managers must confirm in 5 minutes!"
            : "Voice memo distilled & added to review queue.",
        });
        setTranscript("");
        setState("idle");
        onSubmitted();
      } else {
        playSound("error");
        setResult({ ok: false, message: j.error?.message ?? "Failed" });
        setState("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setState("review");
    }
  }

  if (supported === false) {
    return (
      <div className="rounded-md border border-risk-medium/40 bg-risk-medium/10 px-3 py-2 text-sm text-risk-medium">
        Voice recognition not supported in this browser. Try Safari, Chrome, or Edge.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Mic className="h-4 w-4 text-primary" />
        <strong>Voice memo</strong>
        <span className="text-muted-foreground text-xs">— speak naturally; we transcribe + structure</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Language</Label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={state !== "idle"}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Context ID (optional)</Label>
          <Input
            placeholder="e.g. KHZ-001"
            value={contextId}
            onChange={(e) => setContextId(e.target.value)}
            disabled={state !== "idle"}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Context type (optional)</Label>
        <select
          value={contextType}
          onChange={(e) => setContextType(e.target.value)}
          disabled={state !== "idle"}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

      <div className="flex items-center justify-center gap-3 py-4">
        {state === "idle" && (
          <Button onClick={start} size="lg" className="rounded-full h-20 w-20 p-0 bg-primary">
            <Mic className="h-8 w-8" />
          </Button>
        )}
        {state === "listening" && (
          <Button onClick={stop} size="lg" className="rounded-full h-20 w-20 p-0 bg-destructive animate-pulse">
            <MicOff className="h-8 w-8" />
          </Button>
        )}
        {state === "review" && (
          <div className="flex gap-2">
            <Button onClick={() => setState("idle")} variant="outline">
              <Mic className="h-4 w-4" /> Re-record
            </Button>
            <Button onClick={submit} disabled={transcript.trim().length < 10}>
              <Volume2 className="h-4 w-4" /> Submit
            </Button>
          </div>
        )}
        {state === "uploading" && (
          <Button disabled size="lg">
            <Loader2 className="h-5 w-5 animate-spin" /> Distilling…
          </Button>
        )}
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {state === "idle" && "Tap the mic to start"}
        {state === "listening" && "🔴 Recording… tap again to stop"}
        {state === "review" && "Review the transcript, edit if needed, then submit"}
        {state === "uploading" && "AI is structuring your memo…"}
      </div>

      {(transcript || state === "review") && (
        <div>
          <Label className="text-xs">Transcript (editable)</Label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            disabled={state === "listening" || state === "uploading"}
            dir={lang.startsWith("ar") || lang.startsWith("ur") ? "rtl" : "ltr"}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="What you said appears here…"
          />
          <div className="mt-1 text-[10px] text-muted-foreground text-right">{transcript.length} chars</div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}
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
    </div>
  );
}
