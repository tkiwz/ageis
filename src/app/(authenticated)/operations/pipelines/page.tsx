"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GitBranch, Activity, AlertTriangle, Gauge,
  Plus, Search, Loader2, ChevronRight, Droplet, Flame, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  startSiteId: string | null;
  endSiteId: string | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  installedAt: string;
  lastInspection: string | null;
  notes: string | null;
  _count: {
    pressurePoints: number;
    leakAlerts: number;
  };
}

interface KPIs {
  total: number;
  operational: number;
  totalLength: number;
  activeLeaks: number;
  criticalPoints: number;
  warningPoints: number;
}

interface PipelineResponse {
  pipelines: Pipeline[];
  kpis: KPIs;
}

const PRODUCT_ICONS: Record<string, any> = {
  NATURAL_GAS: Flame,
  CRUDE_OIL: Droplet,
  LPG: Zap,
  CONDENSATE: Droplet,
};

const PRODUCT_COLORS: Record<string, string> = {
  NATURAL_GAS: "text-orange-600 bg-orange-50",
  CRUDE_OIL: "text-amber-700 bg-amber-50",
  LPG: "text-blue-600 bg-blue-50",
  CONDENSATE: "text-cyan-600 bg-cyan-50",
};

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: "bg-green-100 text-green-700 border-green-200",
  MAINTENANCE: "bg-yellow-100 text-yellow-700 border-yellow-200",
  INSPECTION: "bg-blue-100 text-blue-700 border-blue-200",
  SHUTDOWN: "bg-red-100 text-red-700 border-red-200",
};

export default function PipelinesPage() {
  const { data, loading } = useApi<PipelineResponse>("/api/pipelines");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");

  const pipelines = data?.pipelines ?? [];
  const kpis = data?.kpis;

  const filtered = pipelines.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (productFilter !== "ALL" && p.productType !== productFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline Network</h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring of pipeline infrastructure across OQ assets
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/operations/pipelines/leaks">
            <Button variant="outline" className="gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Leak Alerts
              {kpis && kpis.activeLeaks > 0 && (
                <span className="ml-1 rounded-full bg-red-600 text-white text-xs px-2 py-0.5">
                  {kpis.activeLeaks}
                </span>
              )}
            </Button>
          </Link>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Pipeline
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={GitBranch}
          label="Total Pipelines"
          value={kpis?.total ?? 0}
          subtitle={`${kpis?.totalLength?.toFixed(0) ?? 0} km network`}
          color="text-blue-600 bg-blue-50"
        />
        <KPICard
          icon={Activity}
          label="Operational"
          value={kpis?.operational ?? 0}
          subtitle="All systems normal"
          color="text-green-600 bg-green-50"
        />
        <KPICard
          icon={AlertTriangle}
          label="Active Leaks"
          value={kpis?.activeLeaks ?? 0}
          subtitle="Requires attention"
          color="text-red-600 bg-red-50"
          highlight={kpis ? kpis.activeLeaks > 0 : false}
        />
        <KPICard
          icon={Gauge}
          label="Pressure Alerts"
          value={(kpis?.criticalPoints ?? 0) + (kpis?.warningPoints ?? 0)}
          subtitle={`${kpis?.criticalPoints ?? 0} critical, ${kpis?.warningPoints ?? 0} warning`}
          color="text-orange-600 bg-orange-50"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pipeline by code, name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm bg-background"
              >
                <option value="ALL">All Status</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="INSPECTION">Inspection</option>
                <option value="SHUTDOWN">Shutdown</option>
              </select>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm bg-background"
              >
                <option value="ALL">All Products</option>
                <option value="NATURAL_GAS">Natural Gas</option>
                <option value="CRUDE_OIL">Crude Oil</option>
                <option value="LPG">LPG</option>
                <option value="CONDENSATE">Condensate</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipelines list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No pipelines match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((pipeline) => (
            <PipelineCard key={pipeline.id} pipeline={pipeline} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============ KPI Card ============
function KPICard({
  icon: Icon, label, value, subtitle, color, highlight = false,
}: {
  icon: any;
  label: string;
  value: number;
  subtitle: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "ring-2 ring-red-400")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={cn("p-2 rounded-lg", color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Pipeline Card ============
function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  const ProductIcon = PRODUCT_ICONS[pipeline.productType] || Droplet;
  const productColor = PRODUCT_COLORS[pipeline.productType] || "text-gray-600 bg-gray-50";
  const statusColor = STATUS_COLORS[pipeline.status] || STATUS_COLORS.OPERATIONAL;
  const hasLeaks = pipeline._count.leakAlerts > 0;

  return (
    <Link href={`/operations/pipelines/${pipeline.id}`}>
      <Card className={cn(
        "hover:shadow-lg transition-all cursor-pointer h-full",
        hasLeaks && "ring-2 ring-red-300"
      )}>
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={cn("p-2 rounded-lg shrink-0", productColor)}>
                <ProductIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {pipeline.code}
                  </span>
                  <span className={cn("text-xs px-2 py-0.5 rounded border", statusColor)}>
                    {pipeline.status}
                  </span>
                  {hasLeaks && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 animate-pulse">
                      {pipeline._count.leakAlerts} LEAK
                    </span>
                  )}
                </div>
                <h3 className="font-semibold mt-2 truncate">{pipeline.name}</h3>
                {pipeline.nameAr && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="rtl">
                    {pipeline.nameAr}
                  </p>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-3 pt-3 border-t">
            <StatItem label="Length" value={`${pipeline.length}`} unit="km" />
            <StatItem label="Diameter" value={`${pipeline.diameter}`} unit='"' />
            <StatItem label="Pressure" value={`${pipeline.pressureMin}-${pipeline.pressureMax}`} unit="bar" />
            <StatItem
              label="Points"
              value={`${pipeline._count.pressurePoints}`}
              unit="sensors"
            />
          </div>

          {/* Product type badge */}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Product: <span className="font-medium text-foreground">
                {pipeline.productType.replace("_", " ")}
              </span>
            </span>
            <span className="text-muted-foreground">
              {pipeline.material}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ============ Stat Item ============
function StatItem({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">
        {value}
        <span className="text-xs text-muted-foreground ml-1">{unit}</span>
      </p>
    </div>
  );
}