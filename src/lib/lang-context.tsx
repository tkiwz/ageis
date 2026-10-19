"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";

/**
 * Legacy API kept for pages not yet moved to useT().
 * Locale now comes from the cookie-backed I18nProvider in the root layout.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useLang() {
  const { locale, isAr, setLocale } = useI18n();
  return { lang: locale, isAr, toggle: () => setLocale(isAr ? "en" : "ar") };
}
