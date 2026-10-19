"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { intlTag } from "@/lib/i18n/config";

export function LiveClock() {
  const { locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;
  const tag = intlTag(locale);

  return (
    <div className="hidden text-end sm:block">
      <div className="num text-sm font-medium leading-none">
        {now.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {now.toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" })}
      </div>
    </div>
  );
}
