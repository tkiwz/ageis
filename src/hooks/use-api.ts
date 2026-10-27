"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/types";

/** Background polls never run faster than this (each poll is a round trip to the server). */
const MIN_POLL_MS = 15_000;

/** Identical GETs started at the same moment (two widgets, one URL) share one request. */
const inFlight = new Map<string, Promise<unknown>>();
function sharedGet(url: string): Promise<unknown> {
  let p = inFlight.get(url);
  if (!p) {
    p = fetch(url, { credentials: "include" })
      .then((r) => r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } })))
      .finally(() => inFlight.delete(url));
    inFlight.set(url, p);
  }
  return p;
}

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetches `url` once on mount and, if `refreshMs` is set, polls silently in the
 * background.  Re-renders the consumer ONLY when the response payload actually
 * changes (JSON-serialisation comparison), so background polls that return the
 * same data are completely invisible to the UI.
 */
export function useApi<T>(
  url: string,
  options: { refreshMs?: number; enabled?: boolean } = {}
): UseApiResult<T> {
  const { refreshMs, enabled = true } = options;

  const [data,    setData]    = useState<T | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs that never cause re-renders ────────────────────────────
  const hasData    = useRef(false);   // true once we have received valid data
  const prevJson   = useRef("");      // last serialised payload
  const mounted    = useRef(true);
  const urlRef     = useRef(url);
  const enabledRef = useRef(enabled);

  useEffect(() => { urlRef.current     = url;     }, [url]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  // Set back to true on (re)mount: React StrictMode mounts, unmounts and mounts again
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Stable fetch function — reads from refs, never recreated ────
  const doFetch = useCallback(async () => {
    if (!enabledRef.current || !mounted.current) return;
    // Show spinner only the very first time
    if (!hasData.current) setLoading(true);

    try {
      const json = (await sharedGet(urlRef.current)) as ApiResponse<T>;
      if (!mounted.current) return;

      if (!json.ok || !json.data) {
        // Only surface errors before we ever had data
        if (!hasData.current) {
          setError(json.error?.message ?? "Request failed");
          setData(null);
        }
      } else {
        hasData.current = true;
        setError(null);
        // Only call setData (and trigger a re-render) if payload changed
        const s = JSON.stringify(json.data);
        if (s !== prevJson.current) {
          prevJson.current = s;
          setData(json.data);
        }
      }
    } catch (err) {
      if (!mounted.current || hasData.current) return;
      setError(err instanceof Error ? err.message : "Network error");
      setData(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []); // stable — all dependencies are refs

  // Fire once on mount / whenever url or enabled changes ────────
  useEffect(() => {
    hasData.current  = false;
    prevJson.current = "";
    doFetch();
  }, [url, enabled, doFetch]);

  // Background polling — interval calls doFetch directly,
  // NO state variable incremented → zero re-renders on tick.
  // Paused while the tab is hidden; refreshes as soon as it is visible again.
  useEffect(() => {
    if (!refreshMs || !enabled) return;
    const ms = Math.max(refreshMs, MIN_POLL_MS);
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (t === null && !document.hidden) t = setInterval(doFetch, ms); };
    const stop = () => { if (t !== null) clearInterval(t); t = null; };
    const onVisibility = () => { if (document.hidden) stop(); else { doFetch(); start(); } };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refreshMs, enabled, doFetch]);

  return { data, error, loading, refresh: doFetch };
}
