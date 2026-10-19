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
      className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent"
    >
      <Languages className="h-4 w-4" />
      <span>{t("layout.switchTo")}</span>
    </button>
  );
}
