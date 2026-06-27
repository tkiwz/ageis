import { requireRole } from "@/lib/auth-helpers";
import { KnowledgeConsole } from "./knowledge-console";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  await requireRole(["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"]);
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">📚 Knowledge Contributions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your field experience — the brain learns from every observation. CRITICAL findings escalate immediately.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">شارك خبرتك الميدانية — العقل يتعلم منها</span>
        </p>
      </div>
      <KnowledgeConsole />
    </div>
  );
}
