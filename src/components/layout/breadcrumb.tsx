"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { en } from "@/lib/i18n/messages/en";

export function Breadcrumb() {
  const pathname = usePathname();
  const { t } = useI18n();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{t("app.name")}</span>
      {segments.map((seg, i) => {
        // Known segments are translated; ids (cuid etc.) are shown as "…"
        const known = seg in en.nav;
        const label = known ? t(`nav.${seg}` as MessageKey) : "…";
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
            <span className={isLast ? "truncate font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
          </span>
        );
      })}
    </nav>
  );
}
