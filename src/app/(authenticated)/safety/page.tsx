import { Brain } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requireRouteAccess } from "@/lib/auth-helpers";

export default async function IntelligencePage() {
  await requireRouteAccess("/intelligence");
  return (
    <ModulePlaceholder
      icon={Brain}
      title="Intelligence"
      titleAr="الذكاء"
      description="AI-powered predictions, rule engine, and full audit trail."
      comingInPhase="Phase 7"
      features={[
        "AI Predictions: Claude-powered risk forecasts (gas exposure, heat stress, etc.)",
        "Rule Engine: 13+ built-in rules with autonomous action authority",
        "Audit Log: Every autonomous & manual action tracked",
        "Pipeline: Sense → Analyze → Act → Learn",
        "Authority levels: AUTO_EXECUTE vs PROPOSE_AND_AWAIT (human approval)",
      ]}
    />
  );
}