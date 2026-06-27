import { requireRole } from "@/lib/auth-helpers";
import { BrainConsole } from "./brain-console";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"]);
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">🧠 AEGIS Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Central orchestrator. Specialist agents. Persistent memory. Learning loop.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">العقل المركزي للنظام</span>
        </p>
      </div>
      <BrainConsole />
    </div>
  );
}
