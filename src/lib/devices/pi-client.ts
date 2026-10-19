import type { PiStatsResponse } from "@/types/devices";

interface PiClientOptions {
  ipAddress: string;
  port?: number;
  timeoutMs?: number;
}

// Pi devices live on a LAN / VPN. Block targets that would let a user make
// the server call itself or cloud metadata (SSRF).
const BLOCKED_HOST = /^(localhost|0\.|127\.|169\.254\.|\[?::1\]?$|\[?::ffff:127\.|metadata)/i;
const VALID_HOST = /^(\d{1,3}(\.\d{1,3}){3}|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$/i;

export function piBaseUrl(opts: { ipAddress: string; port?: number | null }): string {
  const host = opts.ipAddress.trim();
  const port = opts.port ?? 5000;
  if (!VALID_HOST.test(host) || BLOCKED_HOST.test(host)) {
    throw new Error("Invalid device address");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid device port");
  }
  return `http://${host}:${port}`;
}

function baseUrl(opts: PiClientOptions): string {
  return piBaseUrl(opts);
}

export async function piGetStats(opts: PiClientOptions): Promise<PiStatsResponse> {
  const url = `${baseUrl(opts)}/stats`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 4000);

  try {
    const res = await fetch(url, {
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Pi /stats returned ${res.status}`);
    const data = (await res.json()) as PiStatsResponse;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function piPing(opts: PiClientOptions): Promise<boolean> {
  try {
    await piGetStats({ ...opts, timeoutMs: 2000 });
    return true;
  } catch {
    return false;
  }
}

export function piVideoFeedUrl(opts: PiClientOptions): string {
  return `${baseUrl(opts)}/video_feed`;
}
