"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Languages } from "lucide-react";
import { filterNavigationForRole } from "@/lib/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import type { Role } from "@/lib/constants";

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const modules  = filterNavigationForRole(role);
  const { lang, isAr, toggle } = useLang();

  return (
    <aside className={cn(
      "flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur-md",
      isAr ? "items-end" : ""
    )}>
      {/* Logo + Brand */}
      <div className="flex w-full items-center gap-2 border-b border-border px-4 py-4">
        <div className="relative">
          <div className="absolute inset-0 blur-md bg-primary/40 rounded-full" />
          <Shield className="relative h-7 w-7 text-primary" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-none">AEGIS</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {isAr ? "منصة HSSE" : "HSSE Command"}
          </div>
        </div>
        {/* Language toggle */}
        <button
          onClick={toggle}
          title={isAr ? "Switch to English" : "التبديل للعربية"}
          className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Languages className="h-3 w-3" />
          {lang === "en" ? "ع" : "EN"}
        </button>
      </div>

      {/* Status indicator */}
      <div className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="status-dot status-online" />
        <span className="text-xs text-risk-low">{isAr ? "متصل" : "ONLINE"}</span>
        <span className="ml-auto text-xs text-muted-foreground" />
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 w-full">
        <nav className="space-y-6 p-3">
          {modules.map((module) => (
            <div key={module.id}>
              <div className="mb-2 flex items-center gap-2 px-2">
                <module.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {isAr ? (module.labelAr ?? module.label) : module.label}
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
                            ? "bg-primary/10 text-primary glow-primary"
                            : "text-foreground/70 hover:bg-accent hover:text-foreground",
                          isAr ? "flex-row-reverse" : ""
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                        />
                        <span className={cn("flex-1 truncate", isAr ? "text-right" : "")}>
                          {isAr ? (item.labelAr ?? item.label) : item.label}
                        </span>
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

      {/* Footer */}
      <div className="w-full border-t border-border px-4 py-3 flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground/60">
          {isAr ? `النظام الداخلي · ${role}` : `Internal Prototype · ${role}`}
        </div>
      </div>
    </aside>
  );
}
