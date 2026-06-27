import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  variant?: "default" | "success" | "warning" | "danger" | "primary";
  loading?: boolean;
  total?: number;
}

const variantStyles = {
  default: { iconBg: "bg-primary/10 border-primary/20", iconColor: "text-primary", value: "text-foreground" },
  success: { iconBg: "bg-risk-low/10 border-risk-low/30", iconColor: "text-risk-low", value: "text-risk-low" },
  warning: { iconBg: "bg-risk-medium/10 border-risk-medium/30", iconColor: "text-risk-medium", value: "text-risk-medium" },
  danger:  { iconBg: "bg-risk-critical/10 border-risk-critical/30", iconColor: "text-risk-critical", value: "text-risk-critical" },
  primary: { iconBg: "bg-primary/10 border-primary/30", iconColor: "text-primary", value: "text-primary" },
};

export function KpiCard({ icon: Icon, label, value, hint, variant = "default", loading, total }: KpiCardProps) {
  const styles = variantStyles[variant];
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="num mt-1 flex items-baseline gap-1">
              <span className={cn("text-2xl font-semibold", styles.value)}>{loading ? "…" : value}</span>
              {total !== undefined && !loading && (<span className="text-sm text-muted-foreground">/ {total}</span>)}
            </div>
            {hint && <div className="mt-1 text-[10px] text-muted-foreground/70">{hint}</div>}
          </div>
          <div className={cn("rounded-md border p-2", styles.iconBg)}>
            <Icon className={cn("h-4 w-4", styles.iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
