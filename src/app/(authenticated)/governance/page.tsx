import { Factory } from "lucide-react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { requireRouteAccess } from "@/lib/auth-helpers";

export default async function OperationsPage() {
  await requireRouteAccess("/operations");
  return (
    <ModulePlaceholder
      icon={Factory}
      title="Operations"
      titleAr="العمليات"
      description="Day-to-day work management: sites, permits, IoT sensors, and tasks."
      comingInPhase="Phase 5"
      features={[
        "Work Sites: 9 Omani oil & gas fields with GPS, capacity, risk levels",
        "Permits to Work (PTW): Hot work, confined space, electrical, heights",
        "IoT Sensors: H2S, temperature, pressure, gas LEL with thresholds",
        "Tasks: Auto-assignment based on role and skills",
        "Real-time sensor stream with anomaly detection",
      ]}
    />
  );
}