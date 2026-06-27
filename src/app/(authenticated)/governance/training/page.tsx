"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, Clock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Training {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration: number;
  validityDays: number;
  isMandatory: boolean;
  _count: { enrollments: number };
}

interface Enrollment {
  id: string;
  status: string;
  completedAt: string | null;
  expiresAt: string | null;
  autoEnrolled: boolean;
  training: { id: string; title: string; type: string; validityDays: number; isMandatory: boolean };
  user: { id: string; name: string; email: string };
}

interface Kpis { total: number; expiringSoon: number; expired: number; completed: number }

const STATUS: Record<string, string> = {
  ENROLLED:  "border-primary/40 text-primary",
  IN_PROGRESS: "border-risk-medium/40 text-risk-medium",
  COMPLETED: "border-risk-low/40 text-risk-low",
  EXPIRED:   "border-destructive/40 text-destructive",
  OVERDUE:   "border-destructive/40 text-destructive",
};

export default function TrainingPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [kpis, setKpis] = useState<Kpis>({ total: 0, expiringSoon: 0, expired: 0, completed: 0 });
  const [view, setView] = useState<"COURSES" | "ENROLLMENTS" | "MY">("COURSES");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (view === "MY") params.set("mine", "1");
    const r = await fetch(`/api/trainings?${params}`);
    const j = await r.json();
    if (j.ok) {
      setTrainings(j.data.trainings ?? []);
      setEnrollments(j.data.enrollments ?? []);
      setKpis(j.data.kpis ?? kpis);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [view]);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-primary" /> Training
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mandatory courses, certifications, and expiry tracking.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">التدريب والشهادات</span>
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Kpi label="Total Enrollments" value={kpis.total} tone="info" />
        <Kpi label="Completed" value={kpis.completed} tone="success" />
        <Kpi label="Expiring Soon" value={kpis.expiringSoon} tone="warning" />
        <Kpi label="Expired" value={kpis.expired} tone="critical" />
      </div>

      <div className="mb-4 flex gap-2">
        {(["COURSES", "ENROLLMENTS", "MY"] as const).map((v) => (
          <Button key={v} variant={view === v ? "default" : "outline"} size="sm" onClick={() => setView(v)}>
            {v === "MY" ? "My training" : v.toLowerCase()}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : view === "COURSES" ? (
        trainings.length === 0 ? (
          <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No training courses.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {trainings.map((t) => (
              <Card key={t.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{t.title}</span>
                    <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                    {t.isMandatory && <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">MANDATORY</Badge>}
                  </div>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>⏱ {t.duration} min</span>
                    <span>📆 Valid {t.validityDays} days</span>
                    <span>👥 {t._count.enrollments} enrolled</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        enrollments.length === 0 ? (
          <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No enrollments.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {enrollments.map((e) => {
              const now = Date.now();
              const expiringSoon = e.expiresAt && new Date(e.expiresAt).getTime() - now < 30 * 24 * 60 * 60 * 1000;
              const expired = e.status === "EXPIRED" || (e.expiresAt && new Date(e.expiresAt).getTime() < now);
              return (
                <Card key={e.id} className={cn("glass", expired && "border-destructive/40")}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{e.training.title}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS[e.status])}>{e.status}</Badge>
                      {e.training.isMandatory && <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">MANDATORY</Badge>}
                      {e.autoEnrolled && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">AUTO</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{e.user.name}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {e.completedAt && (
                        <span className="flex items-center gap-1 text-risk-low">
                          <CheckCircle2 className="h-3 w-3" /> Completed {new Date(e.completedAt).toLocaleDateString()}
                        </span>
                      )}
                      {e.expiresAt && (
                        <span className={cn("flex items-center gap-1", expired ? "text-destructive" : expiringSoon ? "text-risk-medium" : "")}>
                          {expired ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {expired ? "Expired" : "Expires"}: {new Date(e.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: {
  label: string; value: number; tone: "info" | "success" | "warning" | "critical";
}) {
  const styles = {
    info: "border-primary/40 text-primary",
    success: "border-risk-low/40 text-risk-low",
    warning: "border-risk-medium/40 text-risk-medium",
    critical: "border-destructive/40 text-destructive",
  };
  return (
    <Card className={cn("glass border", styles[tone])}>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 font-display text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}
