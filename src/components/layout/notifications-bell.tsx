"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playSound } from "@/lib/sound";

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

const POLL_MS = 10_000;

export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setItems(j.data.items);
        setUnread(j.data.unreadCount);
      }
    } catch { /* swallow */ }
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

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
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        <Icon className={cn("h-4 w-4", unread > 0 && "text-primary")} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <div className="text-sm font-semibold">
              Notifications {unread > 0 && <span className="text-muted-foreground">({unread} unread)</span>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs"
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No notifications.</div>
            ) : (
              <ul className="divide-y divide-border/30">
                {items.map((n) => {
                  const isUnread = !n.readAt;
                  const sevColor =
                    n.severity === "CRITICAL"
                      ? "border-l-destructive"
                      : n.severity === "WARNING"
                        ? "border-l-risk-medium"
                        : "border-l-primary";

                  const body = (
                    <div
                      className={cn(
                        "block border-l-2 px-3 py-2 transition-colors hover:bg-muted/30",
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
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        {new Date(n.createdAt).toLocaleString()}
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
