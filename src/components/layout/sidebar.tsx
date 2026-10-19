"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterNavigationForRole } from "@/lib/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { Role } from "@/lib/constants";

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const modules = filterNavigationForRole(role);
  const { isAr, t } = useI18n();

  // The most specific matching href is active (so /command doesn't light up on /command/emergencies)
  const allHrefs = modules.flatMap((m) => m.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="material flex h-screen w-[248px] shrink-0 flex-col border-e border-border/70">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" className="rounded-lg outline-offset-4">
          <Logo showTagline={t("app.tagline")} />
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-5 px-3 pb-4 pt-2">
          {modules.map((module) => (
            <div key={module.id}>
              <h3 className="mb-1 px-2.5 text-[11px] font-medium text-muted-foreground">
                {isAr ? module.labelAr : module.label}
              </h3>
              <ul className="space-y-0.5">
                {module.items.map((item) => {
                  const isActive = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-150",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground/75 hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                          strokeWidth={1.75}
                        />
                        <span className="flex-1 truncate">{isAr ? item.labelAr : item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-destructive-foreground">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="status-dot status-online" aria-hidden />
        <span className="truncate">{t("layout.systemOnline")}</span>
      </div>
    </aside>
  );
}
