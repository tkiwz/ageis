"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, FileCheck2, House, Mic, ShieldCheck, WifiOff, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { QUEUE_EVENT, pendingCount, replayQueue } from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

const TABS: { href: string; key: MessageKey; icon: LucideIcon; tone?: "danger" }[] = [
  { href: "/m", key: "mobile.shell.tabs.home", icon: House },
  { href: "/m/safe", key: "mobile.shell.tabs.safe", icon: ShieldCheck },
  { href: "/m/report", key: "mobile.shell.tabs.report", icon: AlertTriangle, tone: "danger" },
  { href: "/m/permits", key: "mobile.shell.tabs.permits", icon: FileCheck2 },
  { href: "/m/voice", key: "mobile.shell.tabs.voice", icon: Mic },
];

export function MobileShell({ userName, children }: { userName: string | null; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { online, waiting } = useOfflineQueue();

  return (
    <div className="min-h-[100dvh] bg-background pb-[calc(76px+env(safe-area-inset-bottom))] text-base">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/m" className="flex items-center gap-2 text-lg font-semibold" dir="ltr">
            <LogoMark className="h-7 w-7" />
            AEGIS
          </Link>
          <div className="flex items-center gap-2">
            {userName && <span className="max-w-[120px] truncate text-sm text-muted-foreground">{userName.split(" ")[0]}</span>}
            <LanguageSwitcher />
          </div>
        </div>
        {(!online || waiting > 0) && (
          <div
            role="status"
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium",
              online ? "bg-info/10 text-info" : "bg-warning/15 text-warning",
            )}
          >
            <WifiOff className="h-4 w-4 shrink-0" />
            {online
              ? t("mobile.shell.sending", { n: waiting })
              : waiting > 0
                ? t("mobile.shell.offlineWaiting", { n: waiting })
                : t("mobile.shell.offline")}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-lg px-4 py-5">{children}</main>

      <nav
        aria-label={t("mobile.shell.tabsLabel")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.href === "/m" ? pathname === "/m" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[68px] flex-col items-center justify-center gap-1 text-[13px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                  tab.tone === "danger" && !active && "text-danger",
                )}
              >
                <tab.icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.75} />
                <span className="leading-none">{t(tab.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Connection + offline queue state; replays the queue when the phone is back online. */
function useOfflineQueue() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const refresh = () => pendingCount().then(setWaiting);
    const goOnline = () => {
      setOnline(true);
      replayQueue().then((r) => setWaiting(r.left));
    };
    const goOffline = () => setOnline(false);

    setOnline(navigator.onLine);
    if (navigator.onLine) goOnline();
    else refresh();

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(QUEUE_EVENT, refresh);
    const timer = window.setInterval(() => navigator.onLine && replayQueue().then((r) => setWaiting(r.left)), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(QUEUE_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, []);

  return { online, waiting };
}
