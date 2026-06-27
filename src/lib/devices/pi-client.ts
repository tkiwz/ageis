import type { PiStatsResponse } from "@/types/devices";

interface PiClientOptions {
  ipAddress: string;
  port?: number;
  timeoutMs?: number;
}

function baseUrl(opts: PiClientOptions): string {
  const port = opts.port ?? 5000;
  return `http://${opts.ipAddress}:${port}`;
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
