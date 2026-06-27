"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, GitBranch, Activity, Box,
  Maximize2, Info,
} from "lucide-react";

// Dynamic import — Three.js needs window.
// Use the default export so the import resolves even if the named export changes.
const Pipeline3DScene = dynamic(
  () => import("@/components/three-d/Pipeline3DScene"),
  { ssr: false, loading: () => <SceneLoader /> }
);

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
    estimatedKmFromStart: number;
  }>;
}

export default function Pipeline3DPage() {
  const params = useParams();
  const id = params.id as string;
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`/api/pipelines/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setPipeline(data.data.pipeline);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="container mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground">Pipeline not found</p>
        <Link href="/operations/pipelines">
          <Button variant="outline" className="mt-4">Back</Button>
        </Link>
      </div>
    );
  }

  // Find active leak
  const activeLeak = pipeline.leakAlerts.find((l) => l.status === "ACTIVE");

  return (
    <div className={fullscreen
      ? "fixed inset-0 z-50 bg-black"
      : "container mx-auto max-w-7xl px-6 py-6 space-y-4"
    }>
      {!fullscreen && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <Link href={`/operations/pipelines/${id}`}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to {pipeline.code}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Powered by AEGIS
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Box className="h-6 w-6 text-orange-500" />
                3D Pipeline Visualization
              </h1>
              <p className="text-muted-foreground mt-1">
                {pipeline.name} • {pipeline.length} km
              </p>
            </div>
            <Button
              onClick={() => setFullscreen(true)}
              variant="outline"
              className="gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              Fullscreen 
            </Button>
          </div>

          {/* Info bar */}
          <Card className="border-orange-200/30 bg-orange-50/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  <div>
                    <strong>Auto-rotating:</strong> Camera orbits around the pipeline automatically
                  </div>
                  <div>
                    <strong>Interactive:</strong> Click and drag to manually rotate. Scroll to zoom.
                  </div>
                  <div>
                    <strong>Live data:</strong> Pressure points are color-coded by real-time status
                    (🟢 Normal, 🟡 Warning, 🔴 Critical).
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 3D Scene */}
      <div className={fullscreen
        ? "w-full h-full"
        : "rounded-lg overflow-hidden border-2 border-orange-300/30 h-[600px] bg-gradient-to-b from-purple-950 to-orange-950"
      }>
        <Pipeline3DScene
          pipelineId={pipeline.id}
          pipelineName={pipeline.code}
          pipelineLength={pipeline.length}
          pressurePoints={pipeline.pressurePoints}
          hasLeak={!!activeLeak}
          leakKm={activeLeak?.estimatedKmFromStart || 0}
        />
      </div>

      {/* Fullscreen exit button */}
      {fullscreen && (
        <Button
          onClick={() => setFullscreen(false)}
          variant="outline"
          className="fixed top-4 right-4 z-50 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Exit Fullscreen
        </Button>
      )}

      {/* Stats below scene */}
      {!fullscreen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Length" value={`${pipeline.length} km`} />
          <StatBox label="Product" value={pipeline.productType.replace("_", " ")} />
          <StatBox label="Sensors" value={`${pipeline.pressurePoints.length}`} />
          <StatBox
            label="Status"
            value={activeLeak ? "🚨 ACTIVE LEAK" : "✅ Healthy"}
            highlight={!!activeLeak}
          />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-red-400" : ""}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-semibold mt-1 ${highlight ? "text-red-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SceneLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-purple-950 to-orange-950">
      <div className="text-center text-white space-y-2">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <div className="text-sm">Loading 3D Engine...</div>
      </div>
    </div>
  );
}