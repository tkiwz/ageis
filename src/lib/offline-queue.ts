/**
 * Offline mutation queue — IndexedDB-backed FIFO of pending POST/PATCH requests
 * the worker tried to make while offline. Service worker replays via background-sync.
 */

const DB_NAME = "aegis-offline";
const STORE = "queue";
const VERSION = 1;

interface QueuedItem {
  id: string;
  url: string;
  method: string;
  body: unknown;
  headers?: Record<string, string>;
  enqueuedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function enqueueMutation(item: Omit<QueuedItem, "id" | "enqueuedAt">): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const full: QueuedItem = { ...item, id, enqueuedAt: Date.now() };
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(full);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  return id;
}

export async function dequeueAll(): Promise<QueuedItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const all = store.getAll();
    all.onsuccess = () => {
      store.clear();
      resolve(all.result as QueuedItem[]);
    };
    all.onerror = () => reject(all.error);
  });
}

export async function pendingCount(): Promise<number> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Try the network, queue on failure.
 *
 * Usage:
 *   await tryOrQueue("/api/incidents", "POST", payload);
 */
export async function tryOrQueue(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): Promise<{ online: boolean; result?: unknown; queueId?: string }> {
  try {
    const res = await fetch(url, { method, body: JSON.stringify(body), headers });
    if (!res.ok && (res.status >= 500 || res.status === 0)) throw new Error(`server ${res.status}`);
    return { online: true, result: await res.json() };
  } catch {
    const queueId = await enqueueMutation({ url, method, body, headers });
    notifyQueueChanged();
    return { online: false, queueId };
  }
}

/** Fired on window whenever the queue changes (shell shows the count). */
export const QUEUE_EVENT = "aegis-queue-changed";
function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

let replaying = false;

/**
 * Send every queued request again (called when the phone is back online and
 * when the mobile app opens). Requests carry a clientId, so a request that
 * already reached the server is not created twice. Network/5xx/401 failures
 * stay queued; other 4xx are dropped (they would never succeed).
 */
export async function replayQueue(): Promise<{ sent: number; left: number }> {
  if (replaying || typeof navigator === "undefined" || !navigator.onLine) return { sent: 0, left: await pendingCount() };
  replaying = true;
  let sent = 0;
  try {
    const items = await dequeueAll();
    for (const item of items) {
      try {
        const res = await fetch(item.url, { method: item.method, body: JSON.stringify(item.body), headers: item.headers });
        if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429)) {
          sent += res.ok ? 1 : 0;
          continue;
        }
        await enqueueMutation({ url: item.url, method: item.method, body: item.body, headers: item.headers });
      } catch {
        await enqueueMutation({ url: item.url, method: item.method, body: item.body, headers: item.headers });
      }
    }
  } finally {
    replaying = false;
    notifyQueueChanged();
  }
  return { sent, left: await pendingCount() };
}
