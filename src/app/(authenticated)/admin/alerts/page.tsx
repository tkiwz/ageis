import { requireRole } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/page-header";
import { AlertsClient } from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AdminAlertsPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"]);
  const t = await getT();
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={t("admin.alerts.title")} description={t("admin.alerts.subtitle")} />
      {/* Same roles as PATCH /api/alerts, so everyone here can acknowledge */}
      <AlertsClient />
    </div>
  );
}
