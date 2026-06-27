"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Clock, MapPin, AlertCircle, Loader2 } from "lucide-react";

interface Permit {
  id: string;
  permitNumber: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  location: string;
  validFrom: string;
  validUntil: string;
  site?: { code: string; name: string; nameAr?: string | null };
}

const RISK_COLOR: Record<string, string> = {
  LOW: "border-risk-low/40 text-risk-low",
  MEDIUM: "border-risk-medium/40 text-risk-medium",
  HIGH: "border-risk-high/40 text-risk-high",
  CRITICAL: "border-destructive/40 text-destructive",
};

export default function MyPermitsPage() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/permits?mine=1&status=ACTIVE", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.ok) setPermits(j.data.permits ?? j.data ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          My active permits
        </h1>
        <p dir="rtl" className="mt-1 text-sm text-muted-foreground">تصاريحي النشطة</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : permits.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No active permits.
          <div dir="rtl" className="mt-1">لا توجد تصاريح نشطة.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {permits.map((p) => {
            const hoursLeft = Math.max(0, Math.round((new Date(p.validUntil).getTime() - Date.now()) / 3_600_000));
            const expiringSoon = hoursLeft < 24;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border/40 bg-background/40 p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-muted-foreground">{p.permitNumber}</div>
                    <div className="mt-1 truncate font-semibold">{p.title}</div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${RISK_COLOR[p.riskLevel] ?? ""}`}>
                    {p.riskLevel}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.location}</span>
                  <span className={`flex items-center gap-1 ${expiringSoon ? "text-risk-medium" : ""}`}>
                    <Clock className="h-3 w-3" /> {hoursLeft}h left
                  </span>
                </div>
                {expiringSoon && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-risk-medium">
                    <AlertCircle className="h-3 w-3" /> Expires soon — request extension if needed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
