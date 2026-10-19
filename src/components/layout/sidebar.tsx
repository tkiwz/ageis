"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { filterNavigationForRole } from "@/lib/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-e border-border bg-card/40 backdrop-blur-md">
      {/* Logo + Brand */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Shield className="h-7 w-7 text-primary" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold leading-none">{t("app.name")}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{t("app.tagline")}</div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="status-dot status-online" />
        <span className="text-xs text-risk-low">{t("layout.systemOnline")}</span>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1">
        <nav className="space-y-6 p-3">
          {modules.map((module) => (
            <div key={module.id}>
              <div className="mb-2 flex items-center gap-2 px-2">
                <module.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {isAr ? module.labelAr ?? module.label : module.label}
                </h3>
              </div>

              <ul className="space-y-0.5">
                {module.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/70 hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        <span className="flex-1 truncate">{isAr ? item.labelAr ?? item.label : item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-risk-critical/20 px-1.5 text-[10px] font-semibold text-risk-critical">
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

      {/* Footer: current role */}
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        {t(`roles.${role}`)}
      </div>
    </aside>
  );
}
