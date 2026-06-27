"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Sparkles, X, AlertCircle, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSecureContextStatus } from "@/lib/secure-context";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

// Minimal types for the Web Speech API
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};
interface SpeechRecognitionEvent extends Event {
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface VoiceResponse {
  intent?: string;
  target?: string;
  speech?: { en?: string; ar?: string; ur?: string; ne?: string };
  data?: unknown;
  actionResult?: unknown;
  confirmationToken?: string;
}

const LANGS = [
  { code: "en", label: "English", locale: "en-US" },
  { code: "ar", label: "العربية", locale: "ar-SA" },
  { code: "ur", label: "اردو", locale: "ur-PK" },
  { code: "ne", label: "नेपाली", locale: "ne-NP" },
] as const;

type LangCode = (typeof LANGS)[number]["code"];

export default function MobileVoicePage() {
  const router = useRouter();
  const [lang, setLang] = useState<LangCode>("en");
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<VoiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sessionIdRef = useRef<string>("");

  // Session id (persists per browser tab)
  useEffect(() => {
    if (sessionIdRef.current) return;
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem("aegis-voice-session");
      if (!id) {
        id = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem("aegis-voice-session", id);
      }
      sessionIdRef.current = id;
    }
  }, []);

  // Init speech recognition when lang changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = LANGS.find((l) => l.code === lang)?.locale ?? "en-US";

    r.onresult = (event) => {
      const lastIdx = event.results.length - 1;
      const result = event.results[lastIdx];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal) processVoice(text);
    };
    r.onerror = (e) => {
      setError(`${e.error}`);
      setState("idle");
    };
    r.onend = () => {
      setState((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch { /* noop */ }
    };
  }, [lang]);

  async function processVoice(text: string) {
    setState("processing");
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          lang,
          sessionId: sessionIdRef.current,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        const msg = data.error?.message ?? "Failed";
        throw new Error(msg);
      }
      setResponse(data.data);
      executeIntent(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("idle");
    }
  }

  function executeIntent(parsed: VoiceResponse) {
    const speech = parsed.speech?.[lang];
    if (speech) speak(speech, LANGS.find((l) => l.code === lang)?.locale ?? "en-US");
    if (parsed.intent === "NAVIGATE" && parsed.target) {
      setTimeout(() => router.push(parsed.target!), 1200);
    }
    setState("speaking");
    setTimeout(() => setState("idle"), 2500);
  }

  function speak(text: string, locale: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  function start() {
    setError(null);
    setTranscript("");
    setResponse(null);

    // Secure-context check first — mic blocked on http://lan-ip
    const ctx = getSecureContextStatus();
    if (!ctx.secure) {
      setError(lang === "ar" ? ctx.suggestionAr : ctx.suggestion);
      return;
    }

    const r = recognitionRef.current;
    if (!r) {
      setError("Voice recognition not available");
      return;
    }
    try {
      r.start();
      setState("listening");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    }
  }

  function stop() {
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    setState("idle");
  }

  function clear() {
    stop();
    setTranscript("");
    setResponse(null);
    setError(null);
  }

  // Friendly error display
  function friendlyError(raw: string): string {
    const e = raw.toLowerCase();
    if (e.includes("not-allowed") || e.includes("not allowed")) {
      return lang === "ar"
        ? "صلاحية الميكروفون مرفوضة — فعّلها من إعدادات المتصفح."
        : "Microphone permission denied. Enable it in browser settings.";
    }
    if (e.includes("no-speech")) {
      return lang === "ar" ? "لم أسمع شيئاً، حاول مجدداً." : "I didn't hear anything. Try again.";
    }
    if (e.includes("spending limit") || e.includes("budget") || e.includes("quota")) {
      return lang === "ar"
        ? "خدمة الذكاء غير متاحة حالياً (وصلت حدّ الصرف)."
        : "AI service unavailable (spending limit reached).";
    }
    if (e.includes("rate limit") || e.includes("429")) {
      return lang === "ar" ? "ازدحام، جرّب بعد ثوانٍ." : "Too many requests, try again.";
    }
    if (raw.length > 160) return raw.slice(0, 160) + "…";
    return raw;
  }

  if (supported === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="h-12 w-12 text-risk-medium" />
        <div>
          <div className="font-semibold">Voice not supported on this browser</div>
          <p className="mt-1 text-sm text-muted-foreground">Use Safari, Chrome, or Edge.</p>
          <p dir="rtl" className="mt-1 text-xs text-muted-foreground">
            استخدم Safari أو Chrome أو Edge
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col items-center justify-between gap-6 px-2 py-4 text-center">
      {/* Language picker */}
      <div className="grid w-full grid-cols-4 gap-1 rounded-full border border-border/40 p-1">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            disabled={state !== "idle"}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs transition-colors disabled:opacity-50",
              lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Big mic */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 w-full">
        <button
          onClick={state === "idle" ? start : stop}
          disabled={state === "processing" || state === "speaking"}
          aria-label="Voice"
          className={cn(
            "relative flex h-40 w-40 items-center justify-center rounded-full shadow-2xl transition-all",
            state === "idle" && "bg-gradient-to-br from-primary to-cyan-700 active:scale-95",
            state === "listening" && "bg-destructive animate-pulse scale-110",
            state === "processing" && "bg-risk-medium",
            state === "speaking" && "bg-risk-low",
          )}
        >
          {state === "idle" && <Mic className="h-16 w-16 text-white" />}
          {state === "listening" && <Mic className="h-16 w-16 text-white" />}
          {state === "processing" && <Loader2 className="h-16 w-16 text-white animate-spin" />}
          {state === "speaking" && <Volume2 className="h-16 w-16 text-white" />}
        </button>

        <div className="text-sm text-muted-foreground">
          {state === "idle"      && (lang === "ar" ? "اضغط للتحدّث" : "Tap to talk")}
          {state === "listening" && (lang === "ar" ? "أتحدّث الآن…" : "Listening…")}
          {state === "processing" && (lang === "ar" ? "أفكّر…" : "Thinking…")}
          {state === "speaking"  && (lang === "ar" ? "AEGIS يرد" : "AEGIS responding")}
        </div>

        {/* Transcript / response card */}
        {(transcript || response || error) && (
          <div className="w-full max-w-md space-y-2 px-1">
            {transcript && (
              <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-left">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {lang === "ar" ? "قلت" : "You said"}
                </div>
                <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"} className="text-sm">
                  {transcript}
                </div>
              </div>
            )}
            {response?.speech && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-left">
                <div className="text-[10px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> AEGIS
                </div>
                <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"} className="text-sm">
                  {response.speech[lang] ?? response.speech.en}
                </div>
                {response.intent === "NAVIGATE" && response.target && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    → {response.target}
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left">
                <div className="text-[10px] uppercase tracking-wider text-destructive mb-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {lang === "ar" ? "خطأ" : "Error"}
                </div>
                <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"} className="whitespace-pre-line text-xs text-destructive leading-relaxed">
                  {friendlyError(error)}
                </div>
              </div>
            )}
            <button
              onClick={clear}
              className="mx-auto flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Hints */}
      <div className="w-full rounded-md border border-border/40 bg-muted/20 p-3 text-left">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          {lang === "ar" ? "أمثلة" : "Try saying"}
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {lang === "ar" ? (
            <>
              <li>• &ldquo;أنا بأمان&rdquo;</li>
              <li>• &ldquo;كم حادثة اليوم&rdquo;</li>
              <li>• &ldquo;افتح خطوط الأنابيب&rdquo;</li>
            </>
          ) : (
            <>
              <li>• &ldquo;I am safe&rdquo;</li>
              <li>• &ldquo;How many incidents today?&rdquo;</li>
              <li>• &ldquo;Open pipelines&rdquo;</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
