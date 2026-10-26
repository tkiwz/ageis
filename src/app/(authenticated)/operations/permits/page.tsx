"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ClipboardCheck, Plus, Search, Loader2, Clock, CheckCircle2,
  XCircle, AlertCircle, MapPin, User,
} from "lucide-react";
import { cn, timeAgo, riskColor } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";

interface Permit {
  id: string;
  permitNumber: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  riskLevel: string;
  location?: string;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  site: { code: string; name: string; nameAr?: string | null } | null;
  requestedBy: { name: string; role: string } | null;
  approvedBy: { name: string; role: string } | null;
}

interface PermitsResponse {
  permits: Permit[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   "border-risk-medium/40 bg-risk-medium/5 text-risk-medium",
  ACTIVE:    "border-risk-low/40 bg-risk-low/5 text-risk-low",
  REJECTED:  "border-risk-critical/40 bg-risk-critical/5 text-risk-critical",
  EXPIRED:   "border-border/40 bg-muted/20 text-muted-foreground",
  COMPLETED: "border-primary/40 bg-primary/5 text-primary",
};

export default function PermitsPage() {
  const { t } = useI18n();
  const f = useFormat();
  const { data, loading } = useApi<PermitsResponse>("/api/permits?limit=50");
  const permits: Permit[] = Array.isArray(data) ? data : (data?.permits ?? []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = permits.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.permitNumber.toLowerCase().includes(q)
        || p.title.toLowerCase().includes(q)
        || p.type.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total:    permits.length,
    pending:  permits.filter((p) => p.status === "PENDING").length,
    active:   permits.filter((p) => p.status === "ACTIVE").length,
    rejected: permits.filter((p) => p.status === "REJECTED").length,
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{t("ops.permits.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("ops.permits.subtitle")}</p>
        </div>
        <Link href="/operations/permits/new">
          <Button>
            <Plus className="h-4 w-4" />
            {t("ops.permits.new")}
          </Button>
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox icon={ClipboardCheck} label={t("ops.permits.kpi.total")} value={stats.total} />
        <KpiBox icon={Clock}          label={t("ops.permits.kpi.pending")} value={stats.pending}  tone="warning" />
        <KpiBox icon={CheckCircle2}   label={t("ops.permits.kpi.active")} value={stats.active}   tone="success" />
        <KpiBox icon={XCircle}        label={t("ops.permits.kpi.rejected")} value={stats.rejected} tone="critical" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("ops.permits.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ALL">{t("ops.permits.allStatuses")}</option>
          {["PENDING", "ACTIVE", "REJECTED", "REVOKED", "EXPIRED", "COMPLETED"].map((s) => (
            <option key={s} value={s}>{f.enum("status", s)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t("ops.permits.noMatch")}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((permit) => (
            <Link key={permit.id} href={`/operations/permits/${permit.id}`}>
              <Card className="glass cursor-pointer transition hover:bg-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num text-[10px] text-muted-foreground">{permit.permitNumber}</span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          STATUS_COLORS[permit.status] ?? STATUS_COLORS.PENDING
                        )}>
                          {f.enum("status", permit.status)}
                        </span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          riskColor(permit.riskLevel)
                        )}>
                          {f.enum("severity", permit.riskLevel)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-medium">{permit.title}</h3>
                      {permit.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {permit.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {permit.site?.name ?? "N/A"}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {permit.requestedBy?.name ?? t("ops.permits.unknown")}
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {f.enum("permitType", permit.type)}
                        </span>
                        <span>{f.relative(permit.createdAt)}</span>
                      </div>
                    </div>
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

function KpiBox({ icon: Icon, label, value, tone }: {
  icon: typeof ClipboardCheck; label: string; value: number;
  tone?: "warning" | "success" | "critical";
}) {
  return (
    <Card className="glass">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <div className={cn(
          "mt-1 font-display text-2xl num",
          tone === "warning"  && "text-risk-medium",
          tone === "success"  && "text-risk-low",
          tone === "critical" && "text-risk-critical"
        )}>{value}</div>
      </CardContent>
    </Card>
  );
}