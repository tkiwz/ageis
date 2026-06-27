"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Factory, MapPin, AlertTriangle, ClipboardCheck, Radio,
  Plus, Search, Loader2, Pencil,
} from "lucide-react";
import { cn, riskColor } from "@/lib/utils";

interface Site {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  type?: string | null;
  region?: string | null;
  status: string;
  riskLevel: string;
  address?: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  activeIncidents: number;
  activePermits:   number;
  sensorCount:     number;
}

export default function SitesPage() {
  const { data: sites, loading } = useApi<Site[]>("/api/sites");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const filtered = (sites ?? []).filter((s) => {
    if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.code.toLowerCase().includes(q)
        || s.name.toLowerCase().includes(q)
        || (s.region ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Work Sites</h1>
          <p className="text-sm text-muted-foreground">
            Manage oil and gas facilities across Oman
          </p>
        </div>
        <Link href="/operations/sites/new">
          <Button>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Site
          </Button>
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox label="Total Sites"      value={sites?.length ?? 0} />
        <KpiBox label="Active"           value={sites?.filter((s) => s.status === "ACTIVE").length ?? 0} tone="success" />
        <KpiBox label="Active Incidents" value={sites?.reduce((sum, s) => sum + s.activeIncidents, 0) ?? 0} tone="critical" />
        <KpiBox label="Active Permits"   value={sites?.reduce((sum, s) => sum + s.activePermits, 0) ?? 0} tone="info" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, name, region..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SHUTDOWN">Shutdown</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No sites match your filters.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((site) => (
            <Link key={site.id} href={`/operations/sites/${site.id}`}>
              <Card className="glass cursor-pointer transition hover:bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num text-[10px] text-muted-foreground">{site.code}</span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          riskColor(site.riskLevel)
                        )}>
                          {site.riskLevel}
                        </span>
                      </div>
                      <h3 className="mt-1 truncate font-medium">{site.name}</h3>
                      {site.nameAr && (
                        <p className="text-xs text-muted-foreground" dir="rtl">{site.nameAr}</p>
                      )}
                    </div>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>

                  {(site.region || site.type) && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {site.region && <span>{site.region}</span>}
                      {site.region && site.type && <span>·</span>}
                      {site.type && <span>{site.type.replace(/_/g, " ")}</span>}
                    </div>
                  )}

                  {site.capacity && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Capacity: <span className="num">{site.capacity.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
                    <Stat icon={AlertTriangle} value={site.activeIncidents} label="Incidents" tone={site.activeIncidents > 0 ? "critical" : "muted"} />
                    <Stat icon={ClipboardCheck} value={site.activePermits} label="Permits" tone="info" />
                    <Stat icon={Radio} value={site.sensorCount} label="Sensors" tone="muted" />
                  </div>

                  <div className="mt-2">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase",
                      site.status === "ACTIVE"
                        ? "border-risk-low/40 bg-risk-low/5 text-risk-low"
                        : site.status === "MAINTENANCE"
                          ? "border-risk-medium/40 bg-risk-medium/5 text-risk-medium"
                          : "border-risk-critical/40 bg-risk-critical/5 text-risk-critical"
                    )}>
                      {site.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiBox({ label, value, tone }: { label: string; value: number; tone?: "critical" | "info" | "success" }) {
  return (
    <Card className="glass">
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn(
          "mt-1 font-display text-2xl num",
          tone === "critical" && "text-risk-critical",
          tone === "info"     && "text-primary",
          tone === "success"  && "text-risk-low"
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, value, label, tone }: {
  icon: typeof Factory; value: number; label: string; tone: "critical" | "info" | "muted";
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={cn(
        "flex items-center gap-1 text-xs num",
        tone === "critical" && "text-risk-critical",
        tone === "info"     && "text-primary",
        tone === "muted"    && "text-muted-foreground"
      )}>
        <Icon className="h-3 w-3" />
        {value}
      </div>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}