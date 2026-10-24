import Link from "next/link";
import { AlertTriangle, ChevronLeft, FileCheck2, HeartPulse, Mic, ShieldCheck, type LucideIcon } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

const ACTIONS: { href: string; icon: LucideIcon; title: MessageKey; hint: MessageKey; tone: string }[] = [
  { href: "/m/permits", icon: FileCheck2, title: "mobile.home.permits.title", hint: "mobile.home.permits.hint", tone: "bg-primary/10 text-primary" },
  { href: "/m/wellness", icon: HeartPulse, title: "mobile.home.wellness.title", hint: "mobile.home.wellness.hint", tone: "bg-info/10 text-info" },
  { href: "/m/voice", icon: Mic, title: "mobile.home.voice.title", hint: "mobile.home.voice.hint", tone: "bg-muted text-foreground" },
];

export default async function MobileHome() {
  const user = await requireAuth();
  const t = await getT();
  const first = user.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{first ? t("mobile.home.greeting", { name: first }) : t("mobile.home.greetingNoName")}</h1>
        <p className="mt-1 text-muted-foreground">{t("mobile.home.prompt")}</p>
      </div>

      {/* The two safety actions: biggest, first */}
      <div className="grid gap-3">
        <Link
          href="/m/report"
          className="flex min-h-[88px] items-center gap-4 rounded-2xl bg-danger px-5 text-destructive-foreground shadow-card transition-transform active:scale-[0.98]"
        >
          <AlertTriangle className="h-9 w-9 shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <div className="text-lg font-semibold">{t("mobile.home.report.title")}</div>
            <div className="text-sm opacity-90">{t("mobile.home.report.hint")}</div>
          </div>
        </Link>
        <Link
          href="/m/safe"
          className="flex min-h-[88px] items-center gap-4 rounded-2xl bg-success px-5 text-white shadow-card transition-transform active:scale-[0.98] dark:text-background"
        >
          <ShieldCheck className="h-9 w-9 shrink-0" strokeWidth={2} />
          <div className="min-w-0">
            <div className="text-lg font-semibold">{t("mobile.home.safe.title")}</div>
            <div className="text-sm opacity-90">{t("mobile.home.safe.hint")}</div>
          </div>
        </Link>
      </div>

      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="flex min-h-[72px] items-center gap-4 px-4 transition-colors active:bg-accent">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", a.tone)}>
              <a.icon className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(a.title)}</span>
              <span className="block truncate text-sm text-muted-foreground">{t(a.hint)}</span>
            </span>
            <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground ltr:rotate-180" />
          </Link>
        ))}
      </div>
    </div>
  );
}
