"use client";

import { useI18n } from "./client";
import { getTranslation } from "./translations";

/**
 * Legacy hook (old flat keys in translations.ts) on top of the new I18nProvider.
 * Only VoiceCommandButton still uses it — prefer useT() from "@/lib/i18n/client".
 */
export function useTranslation() {
  const { locale, dir, setLocale } = useI18n();
  return {
    lang: locale,
    setLang: setLocale,
    t: (key: string) => getTranslation(locale, key),
    isRTL: dir === "rtl",
  };
}
