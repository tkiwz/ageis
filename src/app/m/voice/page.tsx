"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BrainCircuit, Loader2, Mic, Square, Volume2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import { getSecureContextStatus } from "@/lib/secure-context";
import { cn } from "@/lib/utils";

type VoiceState = "idle" | "listening" | "processing" | "speaking";

// Minimal types for the Web Speech API
type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
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
  speech?: { en?: string; ar?: string };
}

const SPEECH_LOCALE = { ar: "ar-OM", en: "en-US" } as const;
const EXAMPLES = ["mobile.voice.example1", "mobile.voice.example2", "mobile.voice.example3"] as const;

/** Voice commands in the app language (Arabic or English). */
export default function MobileVoicePage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const speechLocale = SPEECH_LOCALE[locale];
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sessionIdRef = useRef("");
  const processRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    let id = sessionStorage.getItem("aegis-voice-session");
    if (!id) {
      id = `mobile-${crypto.randomUUID()}`;
      sessionStorage.setItem("aegis-voice-session", id);
    }
    sessionIdRef.current = id;
  }, []);

  useEffect(() => {
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
    r.lang = speechLocale;
    r.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      setTranscript(result[0].transcript);
      if (result.isFinal) processRef.current(result[0].transcript);
    };
    r.onerror = (e) => {
      setErrorKey(e.error === "not-allowed" ? "mobile.voice.micDenied" : e.error === "no-speech" ? "mobile.voice.noSpeech" : "mobile.voice.failed");
      setState("idle");
    };
    r.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    recognitionRef.current = r;
    return () => {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [speechLocale]);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLocale;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  processRef.current = async (text: string) => {
    setState("processing");
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, lang: locale, sessionId: sessionIdRef.current }),
      });
      const data = await res.json();
      if (!data.ok) {
        const code = String(data.error?.code ?? "");
        setErrorKey(code === "RATE_LIMITED" ? "mobile.voice.busy" : code === "AI_BUDGET_EXCEEDED" ? "mobile.voice.aiUnavailable" : "mobile.voice.failed");
        setState("idle");
        return;
      }
      const parsed = data.data as VoiceResponse;
      const speech = parsed.speech?.[locale] ?? parsed.speech?.en ?? null;
      setReply(speech);
      if (speech) speak(speech);
      if (parsed.intent === "NAVIGATE" && parsed.target?.startsWith("/")) setTimeout(() => router.push(parsed.target!), 1200);
      setState("speaking");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setErrorKey("mobile.voice.failed");
      setState("idle");
    }
  };

  function clear() {
    setTranscript("");
    setReply(null);
    setErrorKey(null);
    setErrorText(null);
  }

  function start() {
    clear();
    const ctx = getSecureContextStatus();
    if (!ctx.secure) {
      setErrorText(locale === "ar" ? ctx.suggestionAr : ctx.suggestion);
      return;
    }
    const r = recognitionRef.current;
    if (!r) {
      setErrorKey("mobile.voice.failed");
      return;
    }
    try {
      r.start();
      setState("listening");
    } catch {
      setErrorKey("mobile.voice.failed");
    }
  }

  function stop() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setState("idle");
  }

  if (supported === false) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-12 w-12 text-warning" />
        <h1 className="text-xl font-semibold">{t("mobile.voice.notSupportedTitle")}</h1>
        <p className="text-muted-foreground">{t("mobile.voice.notSupportedBody")}</p>
      </div>
    );
  }

  const statusText =
    state === "listening" ? t("mobile.voice.tapToStop")
    : state === "processing" ? t("mobile.voice.thinking")
    : state === "speaking" ? t("mobile.voice.responding")
    : t("mobile.voice.tapToTalk");
  const error = errorText ?? (errorKey ? t(errorKey) : null);

  return (
    <div className="flex min-h-[calc(100dvh-180px)] flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">{t("mobile.voice.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("mobile.voice.description")}</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <button
          type="button"
          onClick={state === "idle" ? start : stop}
          disabled={state === "processing" || state === "speaking"}
          aria-label={state === "listening" ? t("mobile.voice.tapToStop") : t("mobile.voice.tapToTalk")}
          className={cn(
            "flex h-36 w-36 items-center justify-center rounded-full text-primary-foreground shadow-pop transition-[transform,background-color] duration-200 active:scale-95",
            state === "listening" ? "scale-105 bg-danger" : state === "processing" ? "bg-warning" : state === "speaking" ? "bg-success" : "bg-primary",
          )}
        >
          {state === "listening" ? (
            <Square className="h-12 w-12" fill="currentColor" />
          ) : state === "processing" ? (
            <Loader2 className="h-14 w-14 animate-spin" />
          ) : state === "speaking" ? (
            <Volume2 className="h-14 w-14" />
          ) : (
            <Mic className="h-14 w-14" />
          )}
        </button>
        <div className="text-lg font-medium" aria-live="polite">
          {state === "listening" ? t("mobile.voice.listening") : statusText}
        </div>
      </div>

      {(transcript || reply || error) && (
        <div className="w-full space-y-3 text-start">
          {transcript && (
            <div className="rounded-2xl bg-muted p-4">
              <div className="text-sm text-muted-foreground">{t("mobile.voice.youSaid")}</div>
              <div className="mt-1" dir="auto">{transcript}</div>
            </div>
          )}
          {reply && (
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BrainCircuit className="h-4 w-4" /> {t("mobile.voice.reply")}
              </div>
              <div className="mt-1" dir="auto">{reply}</div>
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-2xl bg-danger/10 p-4 text-danger">
              <div className="text-sm font-medium">{t("mobile.voice.errorTitle")}</div>
              <div className="mt-1 text-sm">{error}</div>
            </div>
          )}
          <Button variant="ghost" className="mx-auto flex" onClick={clear}>
            <X /> {t("mobile.voice.clear")}
          </Button>
        </div>
      )}

      <div className="w-full rounded-2xl bg-muted p-4 text-start">
        <div className="text-sm font-medium">{t("mobile.voice.examplesTitle")}</div>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          {EXAMPLES.map((k) => (
            <li key={k}>“{t(k)}”</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
