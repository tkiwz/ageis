/**
 * In-process LRU cache with TTL. Redis-ready interface.
 *
 * Usage:
 *   const cache = createCache<UserProfile>("user-profile", { maxSize: 500, ttlMs: 60_000 });
 *   const profile = await cache.getOrCompute(userId, () => fetchProfile(userId));
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface CacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

export interface Cache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMs?: number): void;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  getOrCompute(key: string, factory: () => Promise<V>, ttlMs?: number): Promise<V>;
}

const DEFAULTS = { maxSize: 1000, ttlMs: 60_000 };

class LRUCache<V> implements Cache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly inFlight = new Map<string, Promise<V>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  readonly name: string;
  hits = 0;
  misses = 0;

  constructor(name: string, opts: CacheOptions = {}) {
    this.name = name;
    this.maxSize = opts.maxSize ?? DEFAULTS.maxSize;
    this.defaultTtl = opts.ttlMs ?? DEFAULTS.ttlMs;
  }

  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) { this.misses++; return undefined; }
    if (e.expiresAt < Date.now()) { this.store.delete(key); this.misses++; return undefined; }
    // Touch — move to end for LRU
    this.store.delete(key);
    this.store.set(key, e);
    this.hits++;
    return e.value;
  }

  set(key: string, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtl;
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size(): number {
    return this.store.size;
  }

  async getOrCompute(key: string, factory: () => Promise<V>, ttlMs?: number): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    // Single-flight: dedupe concurrent computes for the same key
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const v = await factory();
        this.set(key, v, ttlMs);
        return v;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  stats() {
    return { name: this.name, size: this.store.size, hits: this.hits, misses: this.misses, hitRate: this.hits / Math.max(1, this.hits + this.misses) };
  }
}

const REGISTRY = new Map<string, LRUCache<unknown>>();

export function createCache<V>(name: string, opts?: CacheOptions): Cache<V> {
  if (REGISTRY.has(name)) return REGISTRY.get(name)! as Cache<V>;
  const cache = new LRUCache<V>(name, opts);
  REGISTRY.set(name, cache as LRUCache<unknown>);
  return cache;
}

export function allCacheStats(): { name: string; size: number; hits: number; misses: number; hitRate: number }[] {
  return Array.from(REGISTRY.values()).map((c) => c.stats());
}

export function clearAllCaches(): void {
  for (const c of REGISTRY.values()) c.clear();
}
