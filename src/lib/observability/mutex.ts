/**
 * Promise-based mutex — serializes concurrent callers in a single Node.js process.
 *
 * Use sparingly — holding it across long I/O (like Claude calls) defeats concurrency.
 * Pattern: acquire → check + reserve a slot → release immediately → do the slow work.
 *
 * NOTE: This is a per-instance lock. For multi-instance deployments (load-balanced),
 * replace the internals with Redis-based distributed lock (Redlock / SETNX).
 */

export class Mutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.locked = true;
    return () => this.release();
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the lock directly to the next waiter — atomic from caller's POV.
      next();
    } else {
      this.locked = false;
    }
  }

  /** Convenience: acquire + run + auto-release (handles throws). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** For monitoring/debugging. */
  stats() {
    return { locked: this.locked, queued: this.waiters.length };
  }
}

/** Global named-mutex registry — convenient for per-resource locking. */
const REGISTRY = new Map<string, Mutex>();

export function getMutex(name: string): Mutex {
  let m = REGISTRY.get(name);
  if (!m) {
    m = new Mutex();
    REGISTRY.set(name, m);
  }
  return m;
}
