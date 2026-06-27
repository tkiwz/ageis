"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  GitBranch, ArrowLeft, AlertTriangle, Gauge, Droplet, Flame, Zap,
  Activity, Brain, CheckCircle2, Loader2,
  TrendingDown, MapPin, Shield, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShareInsightButton } from "@/components/knowledge/share-insight-button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

interface PressurePoint {
  id: string;
  code: string;
  positionKm: number;
  latitude: number;
  longitude: number;
  expectedMin: number;
  expectedMax: number;
  currentPressure: number | null;
  currentFlow: number | null;
  currentTemp: number | null;
  status: string;
  lastReadingAt: string | null;
}

interface LeakAlert {
  id: string;
  alertNumber: string;
  severity: string;
  estimatedKmFromStart: number;
  confidence: number;
  pressureDrop: number;
  aiSummary: string | null;
  aiAnalysis: string | null;
  status: string;
  detectedAt: string;
}

interface Pipeline {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  length: number;
  diameter: number;
  material: string;
  status: string;
  productType: string;
  pressureMin: number;
  pressureMax: number;
  flowRate: number | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  installedAt: string;
  lastInspection: string | null;
  notes: string | null;
  pressurePoints: PressurePoint[];
  leakAlerts: LeakAlert[];
}

interface ReadingSeries {
  pointId: string;
  code: string;
  positionKm: number;
  readings: {
    time: string;
    pressure: number;
    flowRate: number | null;
    temperature: number | null;
    status: string;
  }[];
}

// AEGIS Unified Color Palette
const COLORS = {
  primary: "#00D4D8",      // cyan - main brand
  primaryDark: "#00A8AB",
  accent: "#F58320",       // orange - highlights
  navy: "#0B2B5C",
  navyLight: "#1B3D7C",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  muted: "#6B7280",
};

const PRODUCT_ICONS: Record<string, any> = {
  NATURAL_GAS: Flame,
  CRUDE_OIL: Droplet,
  LPG: Zap,
};

const SEVERITY_STYLES: Record<string, string> = {
  LOW: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  HIGH: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  CRITICAL: "bg-red-500/10 text-red-400 border-red-500/30",
};

const CHART_COLORS = ["#00D4D8", "#F58320", "#10B981", "#F59E0B", "#A78BFA"];

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [series, setSeries] = useState<ReadingSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastSimResult, setLastSimResult] = useState<any>(null);
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);

  const refreshData = useCallback(async () => {
    try {
      const [pipelineRes, readingsRes] = await Promise.all([
        fetch(`/api/pipelines/${id}`).then((r) => r.json()),
        fetch(`/api/pipelines/${id}/readings?hours=2`).then((r) => r.json()),
      ]);
      if (pipelineRes.ok) setPipeline(pipelineRes.data.pipeline);
      if (readingsRes.ok) setSeries(readingsRes.data.series);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSimulate = async (severity: "MEDIUM" | "HIGH" | "CRITICAL") => {
    setSimulating(true);
    setLastSimResult(null);
    setLastAnalysis(null);

    try {
      const res = await fetch(`/api/pipelines/${id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity }),
      });
      const data = await res.json();
      if (data.ok) {
        setLastSimResult(data.data);
        await refreshData();
      } else {
        alert("Simulation failed: " + (data.error?.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Simulation error: " + err.message);
    } finally {
      setSimulating(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setLastAnalysis(null);

    try {
      const res = await fetch(`/api/pipelines/${id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setLastAnalysis(data.data);
        await refreshData();
      } else {
        alert("Analysis failed: " + (data.error?.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Analysis error: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.primary }} />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-20 text-center">
        <p className="text-muted-foreground">Pipeline not found</p>
        <Link href="/operations/pipelines">
          <Button variant="outline" className="mt-4">Back to Pipelines</Button>
        </Link>
      </div>
    );
  }

  const ProductIcon = PRODUCT_ICONS[pipeline.productType] || Droplet;
  const hasActiveLeaks = pipeline.leakAlerts.some((l) => l.status === "ACTIVE");
  const chartData = buildChartData(series);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6 space-y-5">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Link href="/operations/pipelines">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Pipelines
          </Button>
        </Link>
        <Link href={`/operations/pipelines/${id}/3d`}>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <Sparkles className="h-4 w-4" />
            View in 3D
          </Button>
        </Link>
      </div>

      {/* Pipeline Header Card */}
      <Card className={cn(
        "border-border/50 bg-card/50 backdrop-blur",
        hasActiveLeaks && "border-red-500/40 shadow-lg shadow-red-500/10"
      )}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div
                className="p-3 rounded-lg shrink-0"
                style={{ backgroundColor: `${COLORS.primary}15`, color: COLORS.primary }}
              >
                <ProductIcon className="h-8 w-8" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="font-mono text-sm bg-muted/50 px-2 py-1 rounded text-foreground">
                    {pipeline.code}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border font-medium",
                      pipeline.status === "OPERATIONAL"
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {pipeline.status}
                  </span>
                  {hasActiveLeaks && (
                    <span className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse font-medium">
                      🚨 ACTIVE LEAK
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold">{pipeline.name}</h1>
                {pipeline.nameAr && (
                  <p className="text-muted-foreground mt-1" dir="rtl">{pipeline.nameAr}</p>
                )}
              </div>
            </div>
            <ShareInsightButton contextType="pipeline" contextId={pipeline.id} />
          </div>

          {/* Specs row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-border/40">
            <Spec label="Length" value={`${pipeline.length}`} unit="km" />
            <Spec label="Diameter" value={`${pipeline.diameter}`} unit='"' />
            <Spec label="Material" value={pipeline.material} />
            <Spec label="Product" value={pipeline.productType.replace("_", " ")} />
            <Spec label="Pressure Range" value={`${pipeline.pressureMin}-${pipeline.pressureMax}`} unit="bar" />
          </div>
        </CardContent>
      </Card>

      {/* ⭐ AI Demo Controls ⭐ */}
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-card/50 to-card/30 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-5">
            <div
              className="p-2.5 rounded-lg shrink-0"
              style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-lg font-bold">AI Live  Controls</h2>
                <span className="text-xs text-muted-foreground"></span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Simulate a pressure anomaly, then run AEGIS AI analysis to detect it in real-time
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Step 1: Simulate */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4" style={{ color: COLORS.accent }} />
                <span className="text-sm font-semibold"> Simulate Pressure Anomaly</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => handleSimulate("MEDIUM")}
                  disabled={simulating || analyzing}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/50"
                >
                  {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-amber-400">●</span>}
                  Medium
                </Button>
                <Button
                  onClick={() => handleSimulate("HIGH")}
                  disabled={simulating || analyzing}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-500/50"
                >
                  {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-orange-400">●</span>}
                  High
                </Button>
                <Button
                  onClick={() => handleSimulate("CRITICAL")}
                  disabled={simulating || analyzing}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                >
                  {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-red-400">●</span>}
                  Critical
                </Button>
              </div>
              {lastSimResult && (
                <div className="text-xs bg-background/50 border border-border/50 px-3 py-2.5 rounded-md">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="text-foreground/80">
                      Simulated <strong className="text-foreground">{lastSimResult.simulation.severity}</strong> anomaly at{" "}
                      <strong className="text-cyan-400">{lastSimResult.targetPoint.code}</strong>{" "}
                      (km {lastSimResult.targetPoint.positionKm.toFixed(1)}). Pressure dropped{" "}
                      {lastSimResult.simulation.dropMagnitude} bar over 90 minutes.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Analyze */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" style={{ color: COLORS.primary }} />
                <span className="text-sm font-semibold"> Analyze with AEGIS AI</span>
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={simulating || analyzing}
                className="w-full text-white border-0 shadow-md transition-all hover:shadow-cyan-500/20"
                style={{
                  background: analyzing
                    ? COLORS.primaryDark
                    : `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)`,
                }}
                size="sm"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    AEGIS is analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Run AI Analysis
                  </>
                )}
              </Button>
              {lastAnalysis && (
                <div className="text-xs bg-background/50 border border-border/50 px-3 py-2.5 rounded-md">
                  {lastAnalysis.analysis.leakDetected ? (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-red-400">LEAK DETECTED</strong>
                        <span className="text-foreground/80"> with {(lastAnalysis.analysis.confidence * 100).toFixed(0)}% confidence</span>
                        <span className="text-foreground/60"> — Alert {lastAnalysis.leakAlert?.alertNumber} created</span>
                        <div className="text-muted-foreground mt-1">
                          Response time: {lastAnalysis.meta.durationMs}ms
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div className="text-foreground/80">
                        <strong className="text-cyan-400">No leak detected</strong> — pipeline is healthy
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis Result */}
      {lastAnalysis && lastAnalysis.analysis.leakDetected && (
        <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 via-card/50 to-card/30 backdrop-blur">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2.5 rounded-lg bg-red-500/15 text-red-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-400">
                  AEGIS AI: Leak Detected
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono">{lastAnalysis.leakAlert?.alertNumber}</span>
                  {" · "}
                  Confidence: <strong className="text-foreground">{(lastAnalysis.analysis.confidence * 100).toFixed(0)}%</strong>
                </p>
              </div>
              <span className={cn(
                "text-xs px-2.5 py-1 rounded-md border font-bold",
                SEVERITY_STYLES[lastAnalysis.analysis.severity]
              )}>
                {lastAnalysis.analysis.severity}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Summary */}
              <div className="bg-background/40 border border-border/40 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <h4 className="font-semibold text-sm">Summary</h4>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">{lastAnalysis.analysis.summary}</p>
                {lastAnalysis.analysis.summaryAr && (
                  <p className="text-sm mt-2.5 text-muted-foreground leading-relaxed border-t border-border/30 pt-2.5" dir="rtl">
                    {lastAnalysis.analysis.summaryAr}
                  </p>
                )}
              </div>

              {/* Location */}
              <div className="bg-background/40 border border-border/40 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <MapPin className="h-4 w-4 text-orange-400" />
                  <h4 className="font-semibold text-sm">Estimated Location</h4>
                </div>
                <p className="text-sm">
                  <strong className="text-foreground text-base">{lastAnalysis.analysis.estimatedKmFromStart} km</strong>
                  <span className="text-muted-foreground"> from pipeline start</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {lastAnalysis.analysis.estimatedLat?.toFixed(4)}, {lastAnalysis.analysis.estimatedLng?.toFixed(4)}
                </p>
                <p className="text-xs mt-2.5 pt-2.5 border-t border-border/30">
                  <span className="text-muted-foreground">Pressure drop: </span>
                  <strong className="text-red-400">{lastAnalysis.analysis.pressureDrop} bar</strong>
                </p>
              </div>

              {/* Immediate Actions */}
              <div className="bg-background/40 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Zap className="h-4 w-4 text-red-400" />
                  <h4 className="font-semibold text-sm text-red-400">Immediate Actions</h4>
                </div>
                <ul className="text-sm space-y-1.5">
                  {lastAnalysis.analysis.immediateActions?.map((action: string, i: number) => (
                    <li key={i} className="flex gap-2 text-foreground/85">
                      <span className="text-red-400 shrink-0">→</span>
                      <span className="leading-relaxed">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Predictions */}
              <div className="bg-background/40 border border-cyan-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Brain className="h-4 w-4 text-cyan-400" />
                  <h4 className="font-semibold text-sm text-cyan-400">Predictions</h4>
                </div>
                <ul className="text-sm space-y-1.5">
                  {lastAnalysis.analysis.predictions?.map((p: string, i: number) => (
                    <li key={i} className="flex gap-2 text-foreground/85">
                      <span className="text-cyan-400 shrink-0">◆</span>
                      <span className="leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Root Cause */}
            {lastAnalysis.analysis.rootCause && (
              <div className="mt-3 bg-background/40 border border-border/40 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Shield className="h-4 w-4 text-orange-400" />
                  <h4 className="font-semibold text-sm">Root Cause Analysis</h4>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">{lastAnalysis.analysis.rootCause}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pressure Chart */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-bold">Live Pressure Readings</h2>
              <span className="text-xs text-muted-foreground">Last 2 hours</span>
            </div>
            <Button variant="ghost" size="sm" onClick={refreshData} className="gap-1 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No recent readings</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    tickFormatter={(t) => new Date(t).toLocaleTimeString("en-GB", {
                      hour: "2-digit", minute: "2-digit"
                    })}
                    stroke="rgba(255,255,255,0.2)"
                  />
                  <YAxis
                    domain={[pipeline.pressureMin - 10, pipeline.pressureMax + 5]}
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    label={{ value: "Pressure (bar)", angle: -90, position: "insideLeft", fill: "#94A3B8", fontSize: 11 }}
                    stroke="rgba(255,255,255,0.2)"
                  />
                  <Tooltip
                    labelFormatter={(t) => new Date(t).toLocaleString("en-GB")}
                    contentStyle={{
                      backgroundColor: "rgba(11, 43, 92, 0.95)",
                      border: "1px solid rgba(0, 212, 216, 0.3)",
                      borderRadius: "6px",
                      fontSize: 11,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    y={pipeline.pressureMin}
                    stroke="#EF4444"
                    strokeDasharray="3 3"
                    label={{ value: "Min Safe", fontSize: 10, position: "right", fill: "#EF4444" }}
                  />
                  <ReferenceLine
                    y={pipeline.pressureMax}
                    stroke="#EF4444"
                    strokeDasharray="3 3"
                    label={{ value: "Max Safe", fontSize: 10, position: "right", fill: "#EF4444" }}
                  />
                  {series.map((s, i) => (
                    <Line
                      key={s.pointId}
                      type="monotone"
                      dataKey={s.code}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pressure Points Table */}
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold">Pressure Points</h2>
            <span className="text-xs text-muted-foreground">
              {pipeline.pressurePoints.length} sensors
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="text-left py-2.5 font-medium">Code</th>
                  <th className="text-left py-2.5 font-medium">Position</th>
                  <th className="text-left py-2.5 font-medium">Current Pressure</th>
                  <th className="text-left py-2.5 font-medium">Flow</th>
                  <th className="text-left py-2.5 font-medium">Temp</th>
                  <th className="text-left py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.pressurePoints.map((point) => (
                  <tr key={point.id} className="border-b last:border-0 border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="py-3 font-mono text-xs text-cyan-400">{point.code}</td>
                    <td className="py-3 text-foreground/80">km {point.positionKm.toFixed(1)}</td>
                    <td className="py-3">
                      {point.currentPressure ? (
                        <span className={cn(
                          "font-semibold",
                          point.status === "CRITICAL" && "text-red-400",
                          point.status === "WARNING" && "text-amber-400",
                          point.status === "NORMAL" && "text-cyan-400",
                        )}>
                          {point.currentPressure.toFixed(1)} bar
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 text-foreground/70">{point.currentFlow?.toFixed(0) || "—"} m³/h</td>
                    <td className="py-3 text-foreground/70">{point.currentTemp?.toFixed(1) || "—"}°C</td>
                    <td className="py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded border font-medium",
                        point.status === "NORMAL" && "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                        point.status === "WARNING" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                        point.status === "CRITICAL" && "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse",
                      )}>
                        {point.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Helpers ============

function Spec({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-1.5 text-foreground">
        {value}
        {unit && <span className="text-xs text-muted-foreground ml-1 font-normal">{unit}</span>}
      </p>
    </div>
  );
}

function buildChartData(series: ReadingSeries[]) {
  const timeMap = new Map<string, any>();
  for (const s of series) {
    for (const r of s.readings) {
      const key = new Date(r.time).toISOString();
      if (!timeMap.has(key)) timeMap.set(key, { time: key });
      timeMap.get(key)[s.code] = r.pressure;
    }
  }
  return Array.from(timeMap.values()).sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );
}