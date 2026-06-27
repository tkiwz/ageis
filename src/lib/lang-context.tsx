"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "en" | "ar";

interface LangContextValue {
  lang:   Lang;
  isAr:   boolean;
  toggle: () => void;
}

const LangContext = createContext<LangContextValue>({
  lang:   "en",
  isAr:   false,
  toggle: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("aegis-lang") as Lang | null;
    if (stored === "ar" || stored === "en") setLang(stored);
  }, []);

  function toggle() {
    setLang((prev) => {
      const next: Lang = prev === "en" ? "ar" : "en";
      localStorage.setItem("aegis-lang", next);
      // Set document direction for RTL support
      document.documentElement.setAttribute("dir", next === "ar" ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", next);
      return next;
    });
  }

  // Apply direction on mount
  useEffect(() => {
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, isAr: lang === "ar", toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

/** Returns Arabic string if lang=ar and arText is provided, otherwise English */
export function t(enText: string, arText?: string) {
  // Hook can't be called from here — use `useLang()` in components
  // This is a simple passthrough helper for use inside the hook result
  return { en: enText, ar: arText ?? enText };
}
