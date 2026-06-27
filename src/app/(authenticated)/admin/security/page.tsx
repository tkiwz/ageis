import { requireRole } from "@/lib/auth-helpers";
import { SecurityDashboard } from "./security-dashboard";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER"]);
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">🔐 Security Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Login attempts, account lockouts, audit chain integrity, environment posture.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">لوحة الأمن</span>
        </p>
      </div>
      <SecurityDashboard />
    </div>
  );
}
