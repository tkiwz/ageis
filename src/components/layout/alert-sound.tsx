"use client";

/**
 * Global ambient listener — polls fresh alerts, wellness alerts, and
 * notifications and plays an appropriate sound for new events.
 */
import { useEffect, useRef } from "react";
import { playForType, playForSeverity, playSound } from "@/lib/sound";
import { subscribeLiveFeed, type LiveFeed } from "@/lib/live-feed";

const STALENESS_MS = 30_000;

export function AlertSound() {
  const seenAlertIds = useRef<Set<string>>(new Set());
  const seenWellnessIds = useRef<Set<string>>(new Set());
  const seenNotifIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    // Shared app-shell poll (/api/live), paused while the tab is hidden
    function onFeed(feed: LiveFeed) {
      try {
        const alerts = feed.alerts;
        const wellness = feed.wellness;
        const notifs = feed.notifications.filter((n) => !n.readAt);

        const now = Date.now();

        // First load: seed seen-sets so we don't blast every existing alert at once.
        if (firstLoad.current) {
          alerts.forEach((a) => seenAlertIds.current.add(a.id));
          wellness.forEach((a) => seenWellnessIds.current.add(a.id));
          notifs.forEach((n) => seenNotifIds.current.add(n.id));
          firstLoad.current = false;
          return;
        }

        for (const a of alerts) {
          if (seenAlertIds.current.has(a.id)) continue;
          seenAlertIds.current.add(a.id);
          if (now - new Date(a.createdAt).getTime() > STALENESS_MS) continue;
          playForType(a.type);
        }
        for (const w of wellness) {
          if (seenWellnessIds.current.has(w.id)) continue;
          seenWellnessIds.current.add(w.id);
          if (now - new Date(w.createdAt).getTime() > STALENESS_MS) continue;
          playSound("wellness");
        }
        for (const n of notifs) {
          if (seenNotifIds.current.has(n.id)) continue;
          seenNotifIds.current.add(n.id);
          if (now - new Date(n.createdAt).getTime() > STALENESS_MS) continue;
          if (n.type === "WELLNESS" || n.type === "ALERT") continue;
          playForSeverity(n.severity);
        }
      } catch { /* swallow */ }
    }

    return subscribeLiveFeed(onFeed);
  }, []);

  return null;
}