"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Camera, AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveVideoFeedProps {
  deviceId: string;
  deviceName: string;
  online: boolean;
}

/**
 * Streams the Pi's MJPEG video via AEGIS proxy.
 * The proxy handles auth, so the browser just embeds an <img>.
 */
export function LiveVideoFeed({ deviceId, deviceName, online }: LiveVideoFeedProps) {
  const [streamKey, setStreamKey] = useState(0);
  const [errored, setErrored] = useState(false);

  function refresh() {
    setErrored(false);
    setStreamKey((k) => k + 1);
  }

  if (!online) {
    return (
      <Card className="glass overflow-hidden">
        <div className="aspect-video flex flex-col items-center justify-center bg-muted/30 text-muted-foreground">
          <Camera className="h-12 w-12 mb-3 opacity-30" />
          <div className="text-sm font-medium">Device offline</div>
          <div className="text-xs mt-1">{deviceName}</div>
          <button
            onClick={refresh}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/50 px-3 py-1.5 text-xs transition-colors hover:bg-accent/30"
          >
            <RotateCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass overflow-hidden">
      <div className="relative aspect-video bg-black">
        {errored ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mb-2 text-risk-medium" />
            <div className="text-sm">Stream lost</div>
            <button
              onClick={refresh}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/50 px-3 py-1.5 text-xs transition-colors hover:bg-accent/30"
            >
              <RotateCw className="h-3 w-3" /> Reconnect
            </button>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={streamKey}
            src={`/api/devices/pi/${deviceId}/stream?_=${streamKey}`}
            alt={`Live feed from ${deviceName}`}
            className="h-full w-full object-contain"
            onError={() => setErrored(true)}
          />
        )}

        {/* Live indicator overlay */}
        {!errored && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md bg-risk-critical/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={refresh}
          className={cn(
            "absolute top-3 right-3 rounded-md bg-black/50 p-1.5 text-white/80 transition-colors hover:bg-black/70 hover:text-white",
            errored && "hidden",
          )}
          title="Refresh stream"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}
