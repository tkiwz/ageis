"use client";

import { useState } from "react";
import { Shield, Check, Loader2, WifiOff } from "lucide-react";
import { tryOrQueue } from "@/lib/offline-queue";

export default function SafeCheckIn() {
  const [state, setState] = useState<"idle" | "submitting" | "online" | "offline">("idle");

  async function submit() {
    setState("submitting");
    // Voice action "markIAmSafe" — uses the same backend pathway
    const res = await tryOrQueue("/api/voice/parse", "POST", {
      transcript: "I am safe",
      lang: "en",
      sessionId: "mobile-safe-button",
    });
    setState(res.online ? "online" : "offline");
  }

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col items-center justify-center gap-6 text-center">
      <Shield className="h-20 w-20 text-risk-low" />
      <div>
        <h1 className="font-display text-2xl">Check in as safe</h1>
        <p dir="rtl" className="mt-1 text-sm text-muted-foreground">سجّل أنك بأمان</p>
      </div>

      {state === "online" || state === "offline" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-risk-low">
            <Check className="h-6 w-6" /> Recorded
          </div>
          {state === "offline" && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <WifiOff className="h-3.5 w-3.5" />
              Offline — will sync when reconnected
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={submit}
          disabled={state === "submitting"}
          className="w-full max-w-xs rounded-full bg-risk-low py-6 text-xl font-bold text-background active:scale-95 transition-transform disabled:opacity-50"
        >
          {state === "submitting" ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : "✓ I AM SAFE"}
        </button>
      )}
    </div>
  );
}
