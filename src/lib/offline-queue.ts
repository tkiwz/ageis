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
    if ("serviceWorker" in navigator && "sync" in (await navigator.serviceWorker.ready)) {
      const reg = await navigator.serviceWorker.ready;
      // @ts-expect-error: sync is non-standard but widely supported
      reg.sync.register("aegis-replay-mutations").catch(() => { /* swallow */ });
    }
    return { online: false, queueId };
  }
}
