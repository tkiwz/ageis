"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n/translate";
import { refreshLiveFeed, subscribeLiveFeed } from "@/lib/live-feed";

interface Notification {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  titleAr?: string | null;
  body: string;
  bodyAr?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Shared app-shell poll (/api/live) — no separate request for the bell
  useEffect(() => subscribeLiveFeed((feed) => {
    setItems(feed.notifications);
    setUnread(feed.unreadCount);
  }), []);
  const load = refreshLiveFeed;

  // Close on outside-click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(ids: string[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    load();
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    load();
  }

  const Icon = unread > 0 ? BellRing : Bell;

  return (
    <div ref={dropdownRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setOpen(!open); playSound("click"); }}
        className="relative"
        aria-label={t("header.notifications")}
      >
        <Icon className={cn("h-[18px] w-[18px] text-muted-foreground", unread > 0 && "text-foreground")} />
        {unread > 0 && (
          <span className="absolute end-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-96 rounded-lg border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <div className="text-sm font-semibold">
              {t("header.notifications")} {unread > 0 && <span className="text-muted-foreground">({t("header.unread", { n: unread })})</span>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs"
            >
              <CheckCheck className="me-1 h-3.5 w-3.5" /> {t("header.markAllRead")}
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("header.noNotifications")}</div>
            ) : (
              <ul className="divide-y divide-border/30">
                {items.map((n) => {
                  const isUnread = !n.readAt;
                  const sevColor =
                    n.severity === "CRITICAL"
                      ? "border-s-destructive"
                      : n.severity === "WARNING"
                        ? "border-s-risk-medium"
                        : "border-s-primary";

                  const body = (
                    <div
                      className={cn(
                        "block border-s-2 px-3 py-2 transition-colors hover:bg-muted/30",
                        sevColor,
                        isUnread && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 text-sm font-medium">{n.title}</div>
                        {isUnread && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markRead([n.id]);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            title={t("header.markAsRead")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        {formatDateTime(n.createdAt, locale)}
                      </div>
                    </div>
                  );

                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => isUnread && markRead([n.id])}>
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
