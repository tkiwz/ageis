"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Sparkles, X, Square } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";
import { getSecureContextStatus } from "@/lib/secure-context";

type ListeningState = "idle" | "listening" | "processing" | "speaking";

// Detect which transcription method the current browser supports
function getSpeechMethod(): "webapi" | "mediarecorder" | "none" {
  if (typeof window === "undefined") return "none";
  const w = window as unknown as Record<string, unknown>;
  if (typeof (w.SpeechRecognition ?? w.webkitSpeechRecognition) === "function") return "webapi";
  if (typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") return "mediarecorder";
  return "none";
}

// ─── Voice selection ────────────────────────────────────────────────────────
// Prefer a smooth male voice. Falls back gracefully if none found.

const MALE_VOICE_KEYWORDS = [
  "male", "man", "guy", "david", "mark", "daniel", "alex",
  "naayf", "reed", "guy", "neural", "natural",
];
const FEMALE_VOICE_KEYWORDS = [
  "female", "woman", "girl", "zira", "helen", "susan", "samantha",
  "victoria", "yelena", "anna", "sarah", "karen", "moira", "tessa",
  "fiona", "nora", "siri", "cortana",
];

function pickMaleVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const langCode = lang === "ar" ? "ar" : lang === "ur" ? "ur" : lang === "ne" ? "ne" : "en";

  // 1. Look for same-language voice that has a known male keyword in name
  const sameLanguage = voices.filter((v) => v.lang.toLowerCase().startsWith(langCode));
  const explicitMale = sameLanguage.find((v) =>
    MALE_VOICE_KEYWORDS.some((k) => v.name.toLowerCase().includes(k))
  );
  if (explicitMale) return explicitMale;

  // 2. Same language, not explicitly female
  const nonFemale = sameLanguage.find((v) =>
    !FEMALE_VOICE_KEYWORDS.some((k) => v.name.toLowerCase().includes(k))
  );
  if (nonFemale) return nonFemale;

  // 3. Any voice for this language
  if (sameLanguage.length > 0) return sameLanguage[0];

  // 4. Absolute fallback — first voice that is not explicitly female
  return (
    voices.find((v) => !FEMALE_VOICE_KEYWORDS.some((k) => v.name.toLowerCase().includes(k))) ??
    voices[0] ??
    null
  );
}

export function VoiceCommandButton() {
  const router = useRouter();
  const { lang, t } = useTranslation();

  const [state,      setState]      = useState<ListeningState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response,   setResponse]   = useState<Record<string, unknown> | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  // Web Speech API ref
  const recognitionRef = useRef<unknown>(null);

  // MediaRecorder refs (Firefox)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const methodRef        = useRef<"webapi" | "mediarecorder" | "none">("none");

  // Pre-load voices as soon as the browser has them
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Voices may load async — trigger a load
    window.speechSynthesis.getVoices();
    const handler = () => window.speechSynthesis.getVoices(); // cache internally
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
  }, []);

  const LOCALES: Record<string, string> = { en: "en-US", ar: "ar-SA", ur: "ur-PK", ne: "ne-NP" };
  const locale = LOCALES[lang] ?? "en-US";

  // Initialise Web Speech API on browsers that support it
  useEffect(() => {
    if (typeof window === "undefined") return;
    methodRef.current = getSpeechMethod();
    if (methodRef.current !== "webapi") return;

    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as new () => unknown;
    const rec = new SR() as {
      continuous: boolean; interimResults: boolean; lang: string;
      onresult: ((e: unknown) => void) | null;
      onerror:  ((e: unknown) => void) | null;
      onend:    (() => void) | null;
      start: () => void; stop: () => void;
    };
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = locale;
    rec.onresult = (event: unknown) => {
      const ev = event as { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } };
      const r  = ev.results[ev.results.length - 1];
      const tx = r[0].transcript;
      setTranscript(tx);
      if (r.isFinal) processVoice(tx);
    };
    rec.onerror = (event: unknown) => {
      const ev = event as { error: string };
      setError("Speech error: " + ev.error);
      setState("idle");
    };
    rec.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    recognitionRef.current = rec;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // ─── speak() — smooth male voice ─────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang  = locale;
    u.rate  = 0.9;   // slightly slower = more natural
    u.pitch = 0.95;  // slightly lower = masculine
    u.volume = 1.0;

    const voice = pickMaleVoice(lang);
    if (voice) u.voice = voice;

    window.speechSynthesis.speak(u);
  }, [lang, locale]);

  // Send transcript to /api/voice/parse
  const processVoice = useCallback(async (text: string) => {
    setState("processing");
    try {
      const res  = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, lang }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || "Voice parse failed");
      setResponse(data.data);
      playSound("voice-done");
      executeIntent(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      playSound("error");
      setState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const executeIntent = useCallback((parsed: Record<string, unknown>) => {
    const speech = parsed.speech as Record<string, string> | undefined;
    const text   = speech?.[lang] || speech?.["en"] || "";
    if (text) speak(text);

    setState("speaking");

    if (parsed.intent === "NAVIGATE" && typeof parsed.target === "string") {
      setTimeout(() => router.push(parsed.target as string), 1200);
    }

    setTimeout(() => { setState("idle"); setTimeout(() => setResponse(null), 5000); }, 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, speak]);

  // Start listening
  const startListening = async () => {
    setError(null); setTranscript(""); setResponse(null);

    const ctx = getSecureContextStatus();
    if (!ctx.secure) { setError(lang === "ar" ? ctx.suggestionAr : ctx.suggestion); playSound("error"); return; }

    const m = getSpeechMethod();
    methodRef.current = m;

    if (m === "none") {
      setError(lang === "ar" ? "التعرف على الصوت غير مدعوم في هذا المتصفح" : "Voice recognition not supported in this browser");
      return;
    }

    if (m === "webapi") {
      const rec = recognitionRef.current as { lang: string; start: () => void } | null;
      if (!rec) return;
      rec.lang = locale;
      try { rec.start(); setState("listening"); playSound("voice-ready"); }
      catch (e: unknown) { setError(e instanceof Error ? e.message : "Could not start mic"); playSound("error"); }
      return;
    }

    // Firefox / MediaRecorder path
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current      = stream;
      audioChunksRef.current = [];

      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/webm")             ? "audio/webm"             :
        MediaRecorder.isTypeSupported("audio/mp4")              ? "audio/mp4"              : "";

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const ext  = mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mime || "audio/webm" });
        const fd   = new FormData();
        fd.append("audio", blob, "recording." + ext);
        fd.append("lang",  lang);

        setState("processing");
        try {
          const res  = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Transcription failed");
          const tx = (data.data?.transcript ?? "") as string;
          setTranscript(tx);
          if (tx) { await processVoice(tx); }
          else    { setError(lang === "ar" ? "لم يتم التعرف على كلام" : "No speech detected"); setState("idle"); }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Transcription error");
          setState("idle"); playSound("error");
        }
      };

      recorder.start();
      setState("listening");
      playSound("voice-ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(lang === "ar" ? "تعذّر الوصول إلى الميكروفون: " + msg : msg);
      playSound("error");
    }
  };

  const stopListening = () => {
    if (methodRef.current === "webapi") {
      (recognitionRef.current as { stop: () => void } | null)?.stop();
      setState("idle");
    } else {
      mediaRecorderRef.current?.stop();
    }
  };

  return (
    <>
      <button
        onClick={state === "idle" ? startListening : stopListening}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg",
          "flex items-center justify-center transition-all duration-300",
          state === "idle"       && "bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-110",
          state === "listening"  && "bg-red-500 animate-pulse scale-110",
          state === "processing" && "bg-amber-500",
          state === "speaking"   && "bg-green-500",
        )}
        aria-label={state === "listening" ? "Stop recording" : "Start voice command"}
        title="AEGIS Voice"
      >
        {state === "idle"       && <Mic      className="h-6 w-6 text-white" />}
        {state === "listening"  && (methodRef.current === "mediarecorder"
          ? <Square   className="h-5 w-5 text-white" />
          : <Mic      className="h-6 w-6 text-white" />)}
        {state === "processing" && <Loader2  className="h-6 w-6 text-white animate-spin" />}
        {state === "speaking"   && <Sparkles className="h-6 w-6 text-white" />}
      </button>

      {(state !== "idle" || response || error) && (
        <div className={cn(
          "fixed bottom-24 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]",
          "bg-popover border rounded-lg shadow-2xl p-4 space-y-3",
          "animate-in slide-in-from-bottom-2"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full",
                state === "listening"  && "bg-red-500 animate-pulse",
                state === "processing" && "bg-amber-500 animate-pulse",
                state === "speaking"   && "bg-green-500",
                state === "idle"       && "bg-gray-400",
              )} />
              <span className="text-sm font-medium">
                {state === "listening"  && (lang === "ar" ? "جارٍ التسجيل…" : t("voice.listening"))}
                {state === "processing" && t("voice.processing")}
                {state === "speaking"   && "AEGIS"}
                {state === "idle"       && "AEGIS Voice"}
              </span>
            </div>
            <button onClick={() => {
              setResponse(null); setError(null); setTranscript("");
              if (state !== "idle") stopListening();
              window.speechSynthesis?.cancel();
            }} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          {state === "listening" && methodRef.current === "mediarecorder" && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Square className="h-3 w-3" />
              {lang === "ar" ? "اضغط الزر مجدداً لإيقاف التسجيل وإرساله" : "Click the button again to stop & send"}
            </div>
          )}

          {transcript && (
            <div className="text-sm bg-muted/50 p-2 rounded">
              <div className="text-xs text-muted-foreground mb-1">{lang === "ar" ? "قلت:" : "You said:"}</div>
              <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"}>{transcript}</div>
            </div>
          )}

          {!!response?.speech && (
            <div className="text-sm bg-primary/10 p-2 rounded border border-primary/20">
              <div className="text-xs text-primary mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AEGIS:
              </div>
              <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"}>
                {String((response.speech as Record<string, string>)[lang] ?? (response.speech as Record<string, string>)["en"] ?? "")}
              </div>
              {response.intent === "NAVIGATE" && (
                <div className="text-xs text-muted-foreground mt-1">
                  {lang === "ar" ? "جاري الانتقال..." : "Navigating..."}
                </div>
              )}
            </div>
          )}

          {error && (() => {
            let display = error;
            const e = error.toLowerCase();
            if (e.includes("groq_api_key") || e.includes("not set") || e.includes("not configured")) {
              display = lang === "ar"
                ? "مفتاح GROQ_API_KEY غير موجود في .env — احصل على مفتاح مجاني من console.groq.com"
                : "GROQ_API_KEY not set in .env — get a free key at console.groq.com";
            } else if (e.includes("spending limit") || e.includes("credit balance")) {
              display = lang === "ar" ? "تم الوصول لحد الصرف — تواصل مع المسؤول." : "AI spending limit reached. Contact your administrator.";
            } else if (e.includes("rate limit") || e.includes("429")) {
              display = lang === "ar" ? "الخدمة مزدحمة — جرّب بعد ثوانٍ." : "Rate-limited. Try again in a few seconds.";
            } else if (e.length > 200) { display = display.slice(0, 200) + "..."; }
            return (
              <div className="text-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 p-2 rounded">
                <div className="font-medium text-xs mb-1">Error</div>
                <div dir={lang === "ar" || lang === "ur" ? "rtl" : "ltr"} className="whitespace-pre-line text-xs leading-relaxed">{display}</div>
              </div>
            );
          })()}

          {state === "idle" && !response && !error && (
            <div className="text-xs text-muted-foreground">
              {lang === "ar" && "جرّب: \"افتح خط الأنابيب\" أو \"كم حادثة اليوم\""}
              {lang === "en" && "Try: \"Open pipelines\" or \"How many incidents today\""}
              {lang === "ur" && "آزمائیں: \"پائپ لائنز کھولیں\""}
              {lang === "ne" && "प्रयास गर्नुहोस्: \"पाइपलाइनहरू खोल्नुहोस्\""}
            </div>
          )}
        </div>
      )}
    </>
  );
}
