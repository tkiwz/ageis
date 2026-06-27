"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Language, LANGUAGES, getTranslation } from "./translations";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "aegis-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  // Load saved language on mount (client-side only)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && LANGUAGES[saved]) {
      setLangState(saved);
    }
    setMounted(true);
  }, []);

  // Apply RTL/LTR + lang attribute to <html>
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const isRTL = LANGUAGES[lang]?.rtl ?? false;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", isRTL ? "rtl" : "ltr");
  }, [lang, mounted]);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
  };

  const t = (key: string) => getTranslation(lang, key);
  const isRTL = LANGUAGES[lang]?.rtl ?? false;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}