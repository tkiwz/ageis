"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

/** One-click Arabic ⇄ English switch (saved in a cookie). */
export function LanguageSwitcher() {
  const { isAr, setLocale, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(isAr ? "en" : "ar")}
      aria-label={t("layout.language")}
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Languages className="h-[18px] w-[18px]" />
      <span>{t("layout.switchTo")}</span>
    </button>
  );
}
