import { requireRole } from "@/lib/auth-helpers";
import { BrainConsole } from "./brain-console";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"]);
  const t = await getT();
  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">{t("intel.brain.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("intel.brain.subtitle")}</p>
      </div>
      <BrainConsole />
    </div>
  );
}
