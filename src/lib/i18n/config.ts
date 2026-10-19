/** i18n config — Arabic (default, RTL) and English. */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "aegis-lang";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Intl tag: Arabic text with Western digits (common in Gulf operations). */
export function intlTag(locale: Locale): string {
  return locale === "ar" ? "ar-OM-u-nu-latn" : "en-GB";
}
