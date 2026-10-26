"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Box, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Three.js needs window — load the scene on the client only
const Pipeline3DScene = dynamic(() => import("@/components/three-d/Pipeline3DScene"), {
  ssr: false,
  loading: () => <SceneLoader />,
});

interface Pipeline {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  length: number;
  productType: string;
  pressurePoints: Array<{
    id: string;
    code: string;
    positionKm: number;
    currentPressure: number | null;
    currentFlow:     number | null;
    currentTemp:     number | null;
    expectedMin: number;
    expectedMax: number;
    latitude:    number;
    longitude:   number;
    status: string;
  }>;
  leakAlerts: Array<{
    id: string;
    status: string;
    severity?: string;
    estimatedKmFromStart: number;
  }>;
}

export default function Pipeline3DPage() {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const params = useParams();
  const id = params.id as string;
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`/api/pipelines/${id}`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setPipeline(data.data.pipeline); })
      .finally(() => setLoading(false));
  }, [id]);

  // Esc leaves full screen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="container mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground">{t("assets.pipeline.notFound.title")}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/operations/pipelines">{t("assets.pipeline3d.scene.open2d")}</Link>
        </Button>
      </div>
    );
  }

  const activeLeak = pipeline.leakAlerts.find((l) => l.status === "ACTIVE");
  const name = isAr && pipeline.nameAr ? pipeline.nameAr : pipeline.name;
  const length = t("assets.units.kmAt", { n: f.number(pipeline.length, { maximumFractionDigits: 1 }) });
  const severity = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).find((s) => s === activeLeak?.severity) ?? "HIGH";

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-background" : "container mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6"}>
      {!fullscreen && (
        <>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/operations/pipelines/${id}`}>
              <ArrowLeft className="rtl:rotate-180" /> {t("assets.pipeline3d.back", { code: pipeline.code })}
            </Link>
          </Button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl tracking-tight">
                <Box className="h-6 w-6 text-primary" /> {t("assets.pipeline3d.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("assets.pipeline3d.description", { name, length })}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("assets.pipeline3d.hint")}</p>
            </div>
            <Button onClick={() => setFullscreen(true)} variant="outline">
              <Maximize2 /> {t("assets.pipeline3d.fullscreen")}
            </Button>
          </div>
        </>
      )}

      <div className={fullscreen ? "h-full w-full" : "h-[min(640px,75vh)] min-h-[420px]"}>
        <Pipeline3DScene
          pipelineId={pipeline.id}
          pipelineName={pipeline.code}
          pipelineLength={pipeline.length}
          pressurePoints={pipeline.pressurePoints}
          hasLeak={!!activeLeak}
          leakKm={activeLeak?.estimatedKmFromStart || 0}
          leakSeverity={severity}
        />
      </div>

      {fullscreen && (
        <Button onClick={() => setFullscreen(false)} variant="outline" className="fixed bottom-4 start-1/2 z-50 -translate-x-1/2 rtl:translate-x-1/2">
          <Minimize2 /> {t("assets.pipeline3d.exitFullscreen")}
        </Button>
      )}

      {!fullscreen && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label={t("assets.pipeline3d.stats.length")} value={length} />
          <StatBox label={t("assets.pipeline3d.stats.product")} value={f.enum("productType", pipeline.productType)} />
          <StatBox label={t("assets.pipeline3d.stats.sensors")} value={f.number(pipeline.pressurePoints.length)} />
          <StatBox
            label={t("assets.pipeline3d.stats.status")}
            value={activeLeak ? t("assets.pipeline3d.stats.leak") : t("assets.pipeline3d.stats.healthy")}
            tone={activeLeak ? "text-danger" : "text-success"}
          />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-semibold", tone)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SceneLoader() {
  const { t } = useI18n();
  return (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-[#0b0e14]">
      <div className="flex flex-col items-center gap-2 text-sm text-[#8b97a8]">
        <Loader2 className="h-6 w-6 animate-spin text-[#5b8def]" />
        {t("assets.pipeline3d.view.loading")}
      </div>
    </div>
  );
}
