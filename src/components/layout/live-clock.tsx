"use client";

import { useEffect, useState } from "react";

export function LiveClock() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
      setDate(
        now.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  if (!time) return null;

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <div className="text-right">
        <div className="num text-sm font-medium leading-none">{time}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {date}
        </div>
      </div>
    </div>
  );
}