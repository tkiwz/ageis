import { requireRole } from "@/lib/auth-helpers";
import { AlertsClient } from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AdminAlertsPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER"]);
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">System Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All alerts dispatched across channels (in-app, WhatsApp, drone).
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">جميع التنبيهات في النظام</span>
        </p>
      </div>
      <AlertsClient />
    </div>
  );
}
