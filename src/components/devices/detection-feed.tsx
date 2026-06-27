"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Eye, Brain, AlertCircle, CheckCircle2, Zap, Loader2 } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { ApiResponse } from "@/types";

interface Detection {
  id: string;
  label: string;
  confidence: number;
  status: string;
  aiAnalyzed: boolean;
  aiSeverity: string | null;
  aiReasoning: string | null;
  aiActions: string[] | null;
  alertId: string | null;
  detectedAt: string;
}

interface DetectionFeedProps {
  deviceId: string;
  online: boolean;
  autoAnalyze?: boolean; // if true, automatically POSTs /poll periodically
}

const severityClass: Record<string, string> = {
  LOW: "border-risk-low/40 bg-risk-low/5 text-risk-low",
  MEDIUM: "border-risk-medium/40 bg-risk-medium/5 text-risk-medium",
  HIGH: "border-risk-high/40 bg-risk-high/5 text-risk-high",
  CRITICAL: "border-risk-critical/40 bg-risk-critical/5 text-risk-critical glow-critical",
};

const statusIcon: Record<string, typeof Eye> = {
  OK: CheckCircle2,
  WARNING: AlertCircle,
  INFO: Eye,
};

export function DetectionFeed({ deviceId, online, autoAnalyze = true }: DetectionFeedProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch detection history
  async function refresh() {
    try {
      const res = await fetch(`/api/devices/${deviceId}/detections?limit=30`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiResponse<Detection[]>;
      if (json.ok && json.data) setDetections(json.data);
    } catch (err) {
      console.error("[detections refresh]", err);
    } finally {
      setLoading(false);
    }
  }

  // Trigger Pi poll + AI analysis
  async function pollOnce() {
    if (!online || polling) return;
    setPolling(true);
    try {
      const res = await fetch(`/api/devices/pi/${deviceId}/poll`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok && json.data?.analyzed) {
        setAnalyzing(true);
        setTimeout(() => setAnalyzing(false), 1500);
      }
      // Always refresh after a poll
      await refresh();
    } catch (err) {
      console.error("[poll error]", err);
    } finally {
      setPolling(false);
    }
  }

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [deviceId]);

  // Auto-poll every 4 seconds when online
  useEffect(() => {
    if (!autoAnalyze || !online) return;
    const interval = setInterval(pollOnce, 4000);
    return () => clearInterval(interval);
  }, [deviceId, online, autoAnalyze]);

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Detection Feed
            {analyzing && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                <Zap className="h-2.5 w-2.5" />
                AI analyzing
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {detections.filter((d) => d.aiAnalyzed).length} analyzed
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={pollOnce}
              disabled={!online || polling}
            >
              {polling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 px-4 pb-4">
            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
            )}
            {!loading && detections.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {online ? "Waiting for detections..." : "Device offline"}
              </div>
            )}
            {detections.map((d) => (
              <DetectionItem key={d.id} detection={d} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function DetectionItem({ detection }: { detection: Detection }) {
  const StatusIcon = statusIcon[detection.status] ?? Eye;
  const sevClass = detection.aiSeverity ? severityClass[detection.aiSeverity] : "border-border/40";
  const actions = Array.isArray(detection.aiActions) ? detection.aiActions : [];

  return (
    <div className={cn("rounded-md border p-2.5", sevClass)}>
      <div className="flex items-start gap-2">
        <StatusIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {detection.label.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(detection.detectedAt)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] num">
            Confidence: {(detection.confidence * 100).toFixed(0)}%
          </div>
          {detection.aiReasoning && (
            <div className="mt-1.5 text-[11px] leading-relaxed">
              💡 {detection.aiReasoning}
            </div>
          )}
          {actions.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {actions.map((action, i) => (
                <div key={i} className="text-[10px] text-muted-foreground">
                  → {action}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
