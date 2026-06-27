"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/types";

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
  useEffect(() => () => { mounted.current = false; }, []);

  // Stable fetch function — reads from refs, never recreated ────
  const doFetch = useCallback(async () => {
    if (!enabledRef.current || !mounted.current) return;
    // Show spinner only the very first time
    if (!hasData.current) setLoading(true);

    try {
      const res  = await fetch(urlRef.current, { credentials: "include" });
      const json = (await res.json()) as ApiResponse<T>;
      if (!mounted.current) return;

      if (!json.ok || !json.data) {
        // Only surface errors before we ever had data
        if (!hasData.current) {
          setError(json.error?.message ?? `HTTP ${res.status}`);
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
  // NO state variable incremented → zero re-renders on tick ─────
  useEffect(() => {
    if (!refreshMs || !enabled) return;
    const t = setInterval(doFetch, refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, enabled, doFetch]);

  return { data, error, loading, refresh: doFetch };
}
