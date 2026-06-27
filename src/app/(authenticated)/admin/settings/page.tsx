import { requireRole } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings, Shield, ServerCog, Database, FileText, Brain } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
          <Settings className="h-7 w-7" /> System Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the platform. Most operational toggles live in Autonomy Control.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">إعدادات النظام</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SettingCard
          href="/admin/autonomy"
          icon={Shield}
          title="Autonomy Control"
          desc="Kill switch, demo mode, per-module gates, AI budget caps"
        />
        <SettingCard
          href="/admin/users"
          icon={ServerCog}
          title="Users & Roles"
          desc="Manage user accounts, roles, and per-site access grants"
        />
        <SettingCard
          href="/intelligence/audit"
          icon={Brain}
          title="AI Audit Log"
          desc="Every AI decision, with reasoning and confidence scores"
        />
        <SettingCard
          href="/intelligence/suggestions"
          icon={Brain}
          title="AI Suggestions"
          desc="Low-confidence AI proposals awaiting human review"
        />
        <SettingCard
          href="/governance/privacy"
          icon={FileText}
          title="Privacy & Compliance"
          desc="PDPL data exports, retention policy, ISO 45001 alignment"
        />
        <SettingCard
          href="/admin/alerts"
          icon={Database}
          title="System Alerts"
          desc="All alerts dispatched across channels"
        />
      </div>

      <Card className="glass mt-6">
        <CardHeader>
          <CardTitle className="text-base">System Info</CardTitle>
          <CardDescription>Environment, version, and runtime details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Platform</dt>
            <dd className="font-mono">AEGIS</dd>
            <dt className="text-muted-foreground">Signed in as</dt>
            <dd className="font-mono">{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-mono">{user.role}</dd>
            <dt className="text-muted-foreground">Environment</dt>
            <dd className="font-mono">{process.env.NODE_ENV}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingCard({ href, icon: Icon, title, desc }: {
  href: string; icon: typeof Settings; title: string; desc: string;
}) {
  return (
    <Link href={href}>
      <Card className="glass transition-colors hover:bg-card/70">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="rounded-md border border-primary/20 bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
