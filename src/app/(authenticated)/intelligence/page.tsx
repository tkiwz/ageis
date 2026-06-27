import { ShieldAlert } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requireRouteAccess } from "@/lib/auth-helpers";

export default async function SafetyPage() {
  await requireRouteAccess("/safety");
  return (
    <ModulePlaceholder
      icon={ShieldAlert}
      title="Safety"
      titleAr="السلامة"
      description="Incident management, observations, investigations, risk assessment, and PPE monitoring."
      comingInPhase="Phase 6"
      features={[
        "Incidents: Reporting with AI-powered severity assessment via Claude",
        "Observations: HSE observation cards (Unsafe Act / Condition / Positive)",
        "Investigations: Root cause analysis with AI evidence collection",
        "Risk Assessment (JSA/HIRA): With AI-suggested controls",
        "PPE Monitor: Live camera feed with auto-detection",
      ]}
    />
  );
}