"use client";

import { useState } from "react";
import { Check, Loader2, ShieldCheck, WifiOff } from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { tryOrQueue } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; at: string } | { kind: "queued" } | { kind: "failed" };

export default function SafeCheckIn() {
  const { t } = useI18n();
  const f = useFormat();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function checkIn() {
    setState({ kind: "sending" });
    const at = new Date().toISOString();
    const res = await tryOrQueue("/api/checkin", "POST", { clientId: crypto.randomUUID(), at });
    if (!res.online) return setState({ kind: "queued" });
    const body = res.result as { ok?: boolean } | undefined;
    setState(body?.ok ? { kind: "done", at } : { kind: "failed" });
  }

  const done = state.kind === "done" || state.kind === "queued";

  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center gap-6 text-center">
      <div
        className={cn(
          "flex h-24 w-24 items-center justify-center rounded-full transition-colors",
          done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="h-12 w-12" strokeWidth={2.5} /> : <ShieldCheck className="h-12 w-12" strokeWidth={1.75} />}
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{state.kind === "done" ? t("mobile.safe.recorded") : t("mobile.safe.title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {state.kind === "done"
            ? t("mobile.safe.recordedAt", { time: f.time(state.at) })
            : state.kind === "queued"
              ? t("mobile.safe.queued")
              : t("mobile.safe.description")}
        </p>
      </div>

      {state.kind === "failed" && (
        <p role="alert" className="max-w-xs rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">{t("mobile.safe.failed")}</p>
      )}

      {done ? (
        <Button variant="outline" size="lg" className="h-14 w-full max-w-xs text-base" onClick={() => setState({ kind: "idle" })}>
          {state.kind === "queued" && <WifiOff />}
          {t("mobile.safe.again")}
        </Button>
      ) : (
        <button
          type="button"
          onClick={checkIn}
          disabled={state.kind === "sending"}
          className="flex h-20 w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-success text-xl font-semibold text-white shadow-card transition-transform active:scale-[0.98] disabled:opacity-70 dark:text-background"
        >
          {state.kind === "sending" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              {t("mobile.safe.sending")}
            </>
          ) : (
            <>
              <ShieldCheck className="h-7 w-7" />
              {t("mobile.safe.button")}
            </>
          )}
        </button>
      )}
    </div>
  );
}
