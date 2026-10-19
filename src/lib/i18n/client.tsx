"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { LOCALE_COOKIE, dirOf, type Locale } from "./config";
import { createT, formatDate, formatDateTime, formatNumber, formatRelative, formatTime, tEnum, type TFunction } from "./translate";
import type { Messages } from "./messages/en";

interface I18nValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  isAr: boolean;
  t: TFunction;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      // Full reload: server components, client state and the dictionary all
      // switch together (a soft refresh can keep the old dictionary).
      window.location.reload();
    },
    [],
  );
  const value = useMemo<I18nValue>(
    () => ({ locale, dir: dirOf(locale), isAr: locale === "ar", t: createT(messages), setLocale }),
    [locale, messages, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}

/** Shortcut: const t = useT(); */
export function useT(): TFunction {
  return useI18n().t;
}

/** Locale-bound formatters: const f = useFormat(); f.date(x), f.relative(x), f.enum("status", v) */
export function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(
    () => ({
      date: (d: Date | string | number, o?: Intl.DateTimeFormatOptions) => formatDate(d, locale, o),
      dateTime: (d: Date | string | number) => formatDateTime(d, locale),
      time: (d: Date | string | number) => formatTime(d, locale),
      relative: (d: Date | string | number) => formatRelative(d, locale),
      number: (n: number, o?: Intl.NumberFormatOptions) => formatNumber(n, locale, o),
      enum: (group: Parameters<typeof tEnum>[1], v: string | null | undefined) => tEnum(t, group, v),
    }),
    [locale, t],
  );
}
