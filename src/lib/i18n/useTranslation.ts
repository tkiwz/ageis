"use client";

import { useLanguage } from "./LanguageProvider";

/**
 * Convenience hook that mirrors react-i18next API
 *
 * Usage:
 *   const { t, lang, setLang, isRTL } = useTranslation();
 *   <h1>{t("nav.dashboard")}</h1>
 */
export function useTranslation() {
  const { lang, setLang, t, isRTL } = useLanguage();
  return { lang, setLang, t, isRTL };
}