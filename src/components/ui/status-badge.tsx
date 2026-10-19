"use client";

import { cn } from "@/lib/utils";
import { useFormat } from "@/lib/i18n/client";
import { TONE_DOT, TONE_SOFT, toneFor, type Tone } from "@/lib/ui/tone";

type Group = Parameters<ReturnType<typeof useFormat>["enum"]>[0];

interface StatusBadgeProps {
  /** Stored value, e.g. "CRITICAL", "PENDING". */
  value: string | null | undefined;
  /** Dictionary group used for the label (default "status"). */
  group?: Group;
  /** Override the computed tone. */
  tone?: Tone;
  /** "soft" pill (default) or "dot" (dot + word, no background). */
  variant?: "soft" | "dot";
  className?: string;
}

/** Dot + word status label. Colour is never the only signal. */
export function StatusBadge({ value, group = "status", tone, variant = "soft", className }: StatusBadgeProps) {
  const f = useFormat();
  if (!value) return null;
  const tn = tone ?? toneFor(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
        variant === "soft" && cn("rounded-full px-2 py-0.5", TONE_SOFT[tn]),
        variant === "dot" && "text-foreground/80",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tn])} aria-hidden />
      {f.enum(group, value)}
    </span>
  );
}
