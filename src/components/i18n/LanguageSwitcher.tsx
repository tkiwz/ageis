"use client";

import { useState } from "react";
import { Languages, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { LANGUAGES, type Language } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  variant?: "compact" | "full";
}

export function LanguageSwitcher({ variant = "compact" }: LanguageSwitcherProps) {
  const { lang, setLang } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = LANGUAGES[lang];

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
          "hover:bg-accent transition-colors",
          "border border-input bg-background"
        )}
      >
        <Languages className="h-4 w-4" />
        <span className="text-lg leading-none">{current.flag}</span>
        {variant === "full" && (
          <span className="font-medium">{current.nativeName}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover shadow-lg z-50 overflow-hidden">
            <div className="py-1">
              {(Object.keys(LANGUAGES) as Language[]).map((code) => {
                const meta = LANGUAGES[code];
                const isActive = code === lang;
                return (
                  <button
                    key={code}
                    onClick={() => {
                      setLang(code);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm",
                      "hover:bg-accent transition-colors",
                      isActive && "bg-accent/50"
                    )}
                    dir={meta.rtl ? "rtl" : "ltr"}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{meta.flag}</span>
                      <div className="text-left">
                        <div className="font-medium">{meta.nativeName}</div>
                        <div className="text-xs text-muted-foreground">{meta.name}</div>
                      </div>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Footer note */}
            <div className="border-t px-3 py-2 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Languages • For all workers
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}