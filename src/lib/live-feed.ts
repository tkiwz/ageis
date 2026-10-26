"use client";

/**
 * Shared client poller for /api/live. Every subscriber (alert sounds, bell…)
 * shares one request every POLL_MS; polling pauses while the tab is hidden
 * and refreshes as soon as it becomes visible again.
 */
export interface LiveFeed {
  alerts: { id: string; type: string; createdAt: string }[];
  wellness: { id: string; alertType: string; severity: string; createdAt: string }[];
  notifications: {
    id: string; type: string; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; titleAr?: string | null;
    body: string; bodyAr?: string | null; link?: string | null; readAt?: string | null; createdAt: string;
  }[];
  unreadCount: number;
}

const POLL_MS = 15_000;
type Listener = (feed: LiveFeed) => void;

const listeners = new Set<Listener>();
let timer: number | null = null;
let inFlight: Promise<void> | null = null;
let last: LiveFeed | null = null;

async function poll(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const r = await fetch("/api/live", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        last = j.data as LiveFeed;
        listeners.forEach((l) => l(last!));
      }
    } catch { /* network — next tick */ }
    finally { inFlight = null; }
  })();
  return inFlight;
}

function onVisibility() {
  if (document.hidden) stop();
  else { poll(); start(); }
}

function start() {
  if (timer !== null || document.hidden) return;
  timer = window.setInterval(poll, POLL_MS);
}

function stop() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

export function subscribeLiveFeed(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    poll();
    start();
  } else if (last) {
    listener(last);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

/** Fetch now (e.g. after marking notifications read). */
export function refreshLiveFeed(): Promise<void> {
  return poll();
}
