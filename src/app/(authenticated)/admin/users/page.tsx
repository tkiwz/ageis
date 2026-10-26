import { requireRole } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/page-header";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);
  const t = await getT();
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={t("admin.users.title")} description={t("admin.users.subtitle")} />
      <UsersClient />
    </div>
  );
}
