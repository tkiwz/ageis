import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, AlertTriangle, ClipboardCheck, HeartPulse, Mic, type LucideIcon } from "lucide-react";

export default async function MobileHome() {
  const user = await requireAuth();
  const firstName = user.name?.split(" ")[0] ?? "Worker";

  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl">Hi {firstName}</h1>
      <p className="text-sm text-muted-foreground">
        What do you need to do?
        <span className="mx-2 opacity-50">·</span>
        <span dir="rtl">ماذا تريد أن تفعل؟</span>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <BigButton href="/m/safe" icon={Shield} label="I am safe" labelAr="أنا بأمان" tone="success" />
        <BigButton href="/m/report" icon={AlertTriangle} label="Report incident" labelAr="بلّغ عن حادثة" tone="warning" />
        <BigButton href="/m/permits" icon={ClipboardCheck} label="My permits" labelAr="تصاريحي" tone="info" />
        <BigButton href="/m/wellness" icon={HeartPulse} label="My wellness" labelAr="صحّتي" tone="critical" />
      </div>

      <Link
        href="/m/voice"
        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-4 text-primary"
      >
        <Mic className="h-5 w-5" />
        <span className="font-medium">Voice command</span>
      </Link>
    </div>
  );
}

function BigButton({
  href, icon: Icon, label, labelAr, tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  labelAr: string;
  tone: "success" | "warning" | "info" | "critical";
}) {
  const colors = {
    success: "border-risk-low/40 text-risk-low",
    warning: "border-risk-medium/40 text-risk-medium",
    info: "border-primary/40 text-primary",
    critical: "border-destructive/40 text-destructive",
  };
  return (
    <Link
      href={href}
      className={`block rounded-xl border-2 bg-background/40 p-4 active:scale-95 transition-transform ${colors[tone]}`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="flex flex-col items-center gap-2 p-2">
          <Icon className="h-8 w-8" />
          <div className="font-medium">{label}</div>
          <div dir="rtl" className="text-xs opacity-70">{labelAr}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
