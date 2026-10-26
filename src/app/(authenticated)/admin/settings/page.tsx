import { requireRole } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings, Shield, ServerCog, Database, FileText, Brain, Lock } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const user = await requireRole(["ADMIN"]);
  const t = await getT();
  const c = (k: string) => t(`admin.settings.cards.${k}` as MessageKey);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={t("admin.settings.title")} description={t("admin.settings.subtitle")} />

      <div className="grid gap-4 md:grid-cols-2">
        <SettingCard href="/admin/autonomy" icon={Shield} title={c("autonomy")} desc={c("autonomyDesc")} />
        <SettingCard href="/admin/users" icon={ServerCog} title={c("users")} desc={c("usersDesc")} />
        <SettingCard href="/admin/security" icon={Lock} title={c("security")} desc={c("securityDesc")} />
        <SettingCard href="/admin/alerts" icon={Database} title={c("alerts")} desc={c("alertsDesc")} />
        <SettingCard href="/intelligence/audit" icon={Brain} title={c("aiAudit")} desc={c("aiAuditDesc")} />
        <SettingCard href="/intelligence/suggestions" icon={Brain} title={c("aiSuggestions")} desc={c("aiSuggestionsDesc")} />
        <SettingCard href="/governance/privacy" icon={FileText} title={c("privacy")} desc={c("privacyDesc")} />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.settings.info.title")}</CardTitle>
          <CardDescription>{t("admin.settings.info.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t("admin.settings.info.platform")}</dt>
            <dd className="font-mono">AEGIS</dd>
            <dt className="text-muted-foreground">{t("admin.settings.info.signedInAs")}</dt>
            <dd className="font-mono" dir="ltr">{user.email}</dd>
            <dt className="text-muted-foreground">{t("admin.settings.info.role")}</dt>
            <dd>{t(`roles.${user.role}`)}</dd>
            <dt className="text-muted-foreground">{t("admin.settings.info.environment")}</dt>
            <dd className="font-mono">{process.env.VERCEL_ENV ?? process.env.NODE_ENV}</dd>
            {process.env.VERCEL_REGION && (
              <>
                <dt className="text-muted-foreground">{t("admin.settings.info.region")}</dt>
                <dd className="font-mono">{process.env.VERCEL_REGION}</dd>
              </>
            )}
            {commit && (
              <>
                <dt className="text-muted-foreground">{t("admin.settings.info.version")}</dt>
                <dd className="font-mono">{commit}</dd>
              </>
            )}
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
      <Card className="glass h-full transition-colors hover:bg-card/70">
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
