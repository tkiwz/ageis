"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Eye, Loader2, RotateCw } from "lucide-react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { ROLE_GROUPS } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

interface Video {
  id: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  summaryEn: string | null;
  summaryAr: string | null;
  lessonsEn: string[];
  lessonsAr: string[];
  prompt: string;
  videoUrl: string | null;
}
interface Brief { prompt: string; summaryEn: string; summaryAr: string; lessonsEn: string[]; lessonsAr: string[] }

/**
 * Incident training video: shows the saved video (free to reopen), a free
 * brief preview, and a paid "create" with a cost confirmation.
 */
export function IncidentVideoCard({ incidentId }: { incidentId: string }) {
  const { t, isAr } = useI18n();
  const role = useSession().data?.user?.role as Role | undefined;
  const canCreate = !!role && ROLE_GROUPS.MANAGE.includes(role);

  const [loading, setLoading] = useState(true);
  const [video, setVideo] = useState<Video | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [usd, setUsd] = useState(1.2);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    fetch(`/api/ai/generate-video?incidentId=${incidentId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setVideo(j.data.video);
        setUsd(j.data.estimatedUsd);
        setConfigured(j.data.configured);
      })
      .finally(() => setLoading(false));
    return () => { if (poll.current) window.clearInterval(poll.current); };
  }, [incidentId]);

  // Poll while Veo is working
  useEffect(() => {
    if (video?.status !== "PROCESSING") return;
    poll.current = window.setInterval(async () => {
      const j = await fetch(`/api/ai/video-status/${video.id}`).then((r) => r.json()).catch(() => null);
      if (!j?.ok || j.data.status === "PROCESSING") return;
      window.clearInterval(poll.current!);
      if (j.data.status === "COMPLETED") setVideo((v) => v && { ...v, status: "COMPLETED", videoUrl: j.data.videoUrl });
      else { setVideo((v) => v && { ...v, status: "FAILED" }); setError("video.failed"); }
    }, 8000);
    return () => { if (poll.current) window.clearInterval(poll.current); };
  }, [video?.id, video?.status]);

  async function preview() {
    setBusy("preview"); setError(null);
    const j = await post({ incidentId, dryRun: true });
    setBusy(null);
    if (j?.ok) setBrief(j.data.brief);
    else setError("video.failed");
  }

  async function create(force: boolean) {
    const msg = t(force ? "video.confirmNew" : "video.confirm", { usd: usd.toFixed(2) });
    if (!window.confirm(msg)) return;
    setBusy("create"); setError(null);
    const j = await post({ incidentId, force });
    setBusy(null);
    if (j?.ok) { setVideo(j.data.video); setBrief(null); }
    else setError(j?.error?.code === "NOT_CONFIGURED" ? "video.notConfigured" : "video.failed");
  }

  const shown = video ?? (brief ? { ...brief, status: "PREVIEW" as const } : null);
  const summary = shown ? (isAr ? shown.summaryAr || shown.summaryEn : shown.summaryEn) : null;
  const lessons = shown ? (isAr && shown.lessonsAr?.length ? shown.lessonsAr : shown.lessonsEn) : [];

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clapperboard className="h-4 w-4 text-muted-foreground" />
          {t("video.title")}
        </CardTitle>
        {canCreate && configured && (
          <div className="flex flex-wrap gap-2">
            {!video && (
              <Button size="sm" variant="outline" onClick={preview} disabled={!!busy}>
                {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}
                {t("video.preview")}
              </Button>
            )}
            {video?.status !== "PROCESSING" && (
              <Button size="sm" variant={video ? "outline" : "default"} onClick={() => create(!!video)} disabled={!!busy}>
                {busy === "create" ? <Loader2 className="animate-spin" /> : video ? <RotateCw /> : <Clapperboard />}
                {video ? t("video.regenerate") : t("video.generate")}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="aspect-video w-full" />
        ) : (
          <>
            {!shown && <p className="text-sm text-muted-foreground">{t("video.intro")} · {t("video.costHint", { usd: usd.toFixed(2) })}</p>}
            {!configured && <p className="text-sm text-muted-foreground">{t("video.notConfigured")}</p>}
            {busy === "create" && <p className="text-sm text-muted-foreground">{t("video.preparing")}</p>}
            {error && <ErrorState message={t(error)} />}

            {video?.status === "PROCESSING" && (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                {t("video.processing")}
              </div>
            )}
            {video?.status === "COMPLETED" && video.videoUrl && (
              <div>
                <video src={video.videoUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("video.saved")}</p>
              </div>
            )}

            {shown && (summary || lessons.length > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                {summary && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{t("video.summary")}</div>
                    <p className="mt-1 text-sm leading-relaxed">{summary}</p>
                  </div>
                )}
                {lessons.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{t("video.lessons")}</div>
                    <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm">
                      {lessons.map((l, i) => <li key={i}>{l}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            )}
            {brief && !video && <p className="text-xs text-muted-foreground">{t("video.previewNote")}</p>}
            {shown?.prompt && (
              <details className="rounded-xl bg-muted p-3 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("video.prompt")}</summary>
                <p className="mt-2 leading-relaxed text-muted-foreground" dir="ltr">{shown.prompt}</p>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function post(body: unknown) {
  return fetch("/api/ai/generate-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null);
}
