import { FileCheck } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requireRouteAccess } from "@/lib/auth-helpers";

export default async function GovernancePage() {
  await requireRouteAccess("/governance");
  return (
    <ModulePlaceholder
      icon={FileCheck}
      title="Governance"
      titleAr="الحوكمة"
      description="Compliance, contractors, inspections, documents, and training programs."
      comingInPhase="Phase 7"
      features={[
        "Compliance: OSHA, EPA, ISO tracking with auto-escalation",
        "Contractor Management: Safety ratings + auto-suspend on poor performance",
        "Inspections: Routine + surprise with AI fraud detection",
        "Documents: Policies, procedures with acknowledgment tracking",
        "Training: Mandatory courses with expiry management",
      ]}
    />
  );
}