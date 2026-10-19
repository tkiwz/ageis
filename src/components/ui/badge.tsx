import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-danger/12 text-danger",
        outline: "border-border text-foreground",
        neutral: "border-transparent bg-muted text-muted-foreground",
        info: "border-transparent bg-info/12 text-info",
        success: "border-transparent bg-success/12 text-success",
        warning: "border-transparent bg-warning/14 text-warning",
        danger: "border-transparent bg-danger/12 text-danger",
        risk: "border-transparent bg-danger/12 text-danger",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
