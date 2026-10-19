"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "./button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Inline error banner with retry. Keep previously loaded data visible around it. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const t = useT();
  return (
    <div role="alert" className={cn("flex items-center gap-3 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm", className)}>
      <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
      <span className="flex-1 text-foreground/90">{message ?? t("common.loadFailed")}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
