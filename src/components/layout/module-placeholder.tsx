import { type LucideIcon, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ModulePlaceholderProps {
  icon: LucideIcon;
  title: string;
  titleAr: string;
  description: string;
  comingInPhase: string;
  features: string[];
}

export function ModulePlaceholder({
  icon: Icon,
  title,
  titleAr,
  description,
  comingInPhase,
  features,
}: ModulePlaceholderProps) {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Module Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="relative">
          <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground" dir="rtl">
            {titleAr}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-risk-medium/40 bg-risk-medium/10 px-3 py-1 text-xs font-medium text-risk-medium">
          <Construction className="h-3 w-3" />
          {comingInPhase}
        </span>
      </div>

      {/* Features list */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">What this module will include</CardTitle>
          <CardDescription>Functionality planned for this section</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="text-foreground/80">{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Note */}
      <div className="mt-4 rounded-md border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground">
        💡 <strong className="text-foreground/80">Phase 3 (UI Shell)</strong> establishes the
        navigation framework. The actual module functionality will be implemented in later phases
        as outlined in the roadmap.
      </div>
    </div>
  );
}