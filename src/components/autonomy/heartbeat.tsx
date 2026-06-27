"use client";

/**
 * Background heartbeat — fires POST /api/autonomy/pipeline/tick periodically
 * while the user has the dashboard open. Cadence is read from autonomy
 * settings (so flipping Demo Mode pauses it).
 *
 * Drop this component into the authenticated layout. It renders nothing.
 */
import { useEffect, useRef, useState } from "react";

interface TickPreview {
  ranAt: string;
  blocked?: string;
  scanned: number;
  hits: { code: string }[];
  analyzed?: { code: string; result?: { leakDetected: boolean; severity?: string; blocked?: string } }[];
}

export function AutonomyHeartbeat() {
  const [last, setLast] = useState<TickPreview | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;

    async function tickOnce() {
      try {
        const settingsRes = await fetch("/api/autonomy/settings", { cache: "no-store" });
        const settingsJson = await settingsRes.json();
        if (!settingsJson.ok) return;
        const s = settingsJson.data;
        if (!s.globalEnabled || !s.pipelineLoopEnabled || s.demoMode) {
          // Loop paused — keep polling settings but don't tick.
          return;
        }
        const tickRes = await fetch("/api/autonomy/pipeline/tick", {
          method: "POST",
          cache: "no-store",
        });
        const tickJson = await tickRes.json();
        if (tickJson.ok && !stopped) setLast(tickJson.data);
      } catch {
        /* network — try next tick */
      }
    }

    async function setupInterval() {
      try {
        const settingsRes = await fetch("/api/autonomy/settings", { cache: "no-store" });
        const s = (await settingsRes.json()).data;
        const ms = Math.max(10, s?.pipelinePollSeconds ?? 30) * 1000;
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(tickOnce, ms);
        tickOnce(); // immediate first tick
      } catch {
        intervalRef.current = window.setInterval(tickOnce, 30_000);
      }
    }

    setupInterval();
    return () => {
      stopped = true;
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  // Surface latest tick result for debugging in dev; hidden visually otherwise.
  if (!last) return null;
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div
      className="pointer-events-none fixed bottom-2 left-2 z-50 select-none rounded-md border border-border/40 bg-background/80 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur"
      title="Autonomy heartbeat (dev only)"
    >
      ⏱ tick @ {new Date(last.ranAt).toLocaleTimeString()} ·{" "}
      {last.blocked ? `paused (${last.blocked})` : `scan ${last.scanned} · hits ${last.hits.length}`}
    </div>
  );
}
