"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, dirOf, type Locale } from "./config";
import { createT, type TFunction } from "./translate";
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
  const router = useRouter();
  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      document.documentElement.dir = dirOf(l);
      router.refresh(); // server re-renders with the new dictionary
    },
    [router],
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
