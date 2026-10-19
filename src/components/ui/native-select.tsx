import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Styled native <select> (accessible, mobile-friendly, RTL-safe chevron). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-input bg-card pe-9 ps-3 text-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
