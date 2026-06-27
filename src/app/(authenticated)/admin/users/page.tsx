import { requireRole } from "@/lib/auth-helpers";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole(["ADMIN"]);
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create users, assign roles, and grant per-site access.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">إدارة المستخدمين والصلاحيات</span>
        </p>
      </div>
      <UsersClient />
    </div>
  );
}
