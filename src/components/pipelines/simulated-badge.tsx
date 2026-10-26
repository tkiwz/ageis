"use client";

import { FlaskConical } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { TONE_SOFT } from "@/lib/ui/tone";

/** Marks a pipeline whose readings come from the simulator, not the operator's SCADA. */
export function SimulatedBadge({ className, dark }: { className?: string; dark?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      title={t("assets.pipelines.simulatedHint")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        dark ? "bg-[#e5a53b]/15 text-[#e5a53b]" : TONE_SOFT.warning,
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      {t("assets.pipelines.simulated")}
    </span>
  );
}
