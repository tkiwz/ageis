import { requireAuth } from "@/lib/auth-helpers";
import { ROLE_LABELS } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity, Shield, AlertTriangle, ClipboardCheck, Radio, Brain,
  ShieldAlert, CheckCircle2,
  type LucideIcon,
} from "lucide-react";

interface PageProps {
  searchParams: Promise<{ denied?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await requireAuth();
  const params = await searchParams;
  const wasDenied = params.denied === "true";
  const roleLabel = ROLE_LABELS[user.role];

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">
          Welcome back, {user.name?.split(" ")[0] ?? "User"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel.en} · <span dir="rtl" className="inline-block">{roleLabel.ar}</span>
        </p>
      </div>

      {wasDenied && (
        <Alert variant="destructive" className="mb-6">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Your role ({roleLabel.en}) does not have permission to access that page.
          </AlertDescription>
        </Alert>
      )}

      <Alert className="mb-6 border-risk-low/30 bg-risk-low/10 text-risk-low">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle className="text-risk-low">Phase 3 — UI Shell Complete</AlertTitle>
        <AlertDescription className="text-risk-low/80">
          Sidebar, header, and role-aware navigation are now active. Use the sidebar to explore modules.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StubCard icon={Activity} label="Active Sites" value="—" hint="Phase 4" />
        <StubCard icon={AlertTriangle} label="Open Incidents" value="—" hint="Phase 6" />
        <StubCard icon={ClipboardCheck} label="Active Permits" value="—" hint="Phase 5" />
        <StubCard icon={Radio} label="Online Sensors" value="—" hint="Phase 5" />
      </div>

      <Card className="glass mt-6">
        <CardHeader>
          <CardTitle className="text-base">Module Roadmap</CardTitle>
          <CardDescription>
            Explore the platform structure — full functionality being built phase by phase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoadmapItem icon={Shield} label="Command Center" status="Shell ready" phase="Phase 4" />
            <RoadmapItem icon={Activity} label="Operations" status="Shell ready" phase="Phase 5" />
            <RoadmapItem icon={ShieldAlert} label="Safety" status="Shell ready" phase="Phase 6" />
            <RoadmapItem icon={Brain} label="Intelligence (AI)" status="Shell ready" phase="Phase 7" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StubCard({ icon: Icon, label, value, hint }: {
  icon: LucideIcon; label: string; value: string; hint: string;
}) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="num mt-1 text-2xl font-semibold">{value}</div>
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground/60">{hint}</div>
      </CardContent>
    </Card>
  );
}

function RoadmapItem({ icon: Icon, label, status, phase }: {
  icon: LucideIcon; label: string; status: string; phase: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 p-3">
      <div className="rounded-md border border-primary/20 bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{status}</div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-risk-medium">{phase}</span>
    </div>
  );
}