"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
  /** Match nested routes too (default true). */
  prefix?: boolean;
}

/**
 * Route tabs for merged sections (e.g. Incidents | Investigations,
 * Devices | Drones | ESP32). One place, no system-hopping.
 */
export function SectionTabs({ tabs, className, label }: { tabs: SectionTab[]; className?: string; label?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("mb-6 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1", className)} aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.prefix === false ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm transition-colors duration-150",
              active ? "bg-card font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
