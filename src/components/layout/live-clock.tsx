"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/i18n/translate";

export function LiveClock() {
  const { locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <div className="hidden text-end sm:block">
      <div className="num text-sm font-medium leading-none">
        {formatDate(now, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {formatDate(now, locale, { weekday: "short", month: "short", day: "numeric" })}
      </div>
    </div>
  );
}
