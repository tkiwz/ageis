"use client";

/**
 * Global ambient listener — polls fresh alerts, wellness alerts, and
 * notifications and plays an appropriate sound for new events.
 */
import { useEffect, useRef } from "react";
import { playForType, playForSeverity, playSound } from "@/lib/sound";

interface AlertItem { id: string; type: string; severity?: string; createdAt: string }
interface WellnessAlertItem { id: string; alertType: string; severity: string; createdAt: string }
interface NotificationItem { id: string; type: string; severity: string; createdAt: string }

const POLL_MS = 8_000;
const STALENESS_MS = 30_000;

export function AlertSound() {
  const seenAlertIds = useRef<Set<string>>(new Set());
  const seenWellnessIds = useRef<Set<string>>(new Set());
  const seenNotifIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [aR, wR, nR] = await Promise.all([
          fetch("/api/alerts?limit=10", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/wellness/alerts?status=OPEN", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/notifications?unread=1&limit=10", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;

        const alerts: AlertItem[] = aR?.data?.alerts ?? (Array.isArray(aR?.data) ? aR.data : []);
        const wellness: WellnessAlertItem[] = wR?.data?.alerts ?? [];
        const notifs: NotificationItem[] = nR?.data?.items ?? [];

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
          playForType(a.type, a.severity);
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

    poll();
    const i = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(i); };
  }, []);

  return null;
}