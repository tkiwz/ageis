import { describe, it, expect } from "vitest";
import { createCache } from "./cache";

describe("LRU cache", () => {
  it("stores and retrieves values", () => {
    const c = createCache<string>(`t1-${Math.random()}`);
    c.set("a", "alpha");
    expect(c.get("a")).toBe("alpha");
  });

  it("returns undefined after TTL", async () => {
    const c = createCache<number>(`t2-${Math.random()}`, { ttlMs: 5 });
    c.set("k", 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.get("k")).toBeUndefined();
  });

  it("evicts oldest when at max size", () => {
    const c = createCache<number>(`t3-${Math.random()}`, { maxSize: 2 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3); // should evict 'a'
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });

  it("getOrCompute dedupes concurrent calls", async () => {
    const c = createCache<number>(`t4-${Math.random()}`);
    let calls = 0;
    const factory = async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return 42; };
    const [a, b, c2] = await Promise.all([
      c.getOrCompute("k", factory),
      c.getOrCompute("k", factory),
      c.getOrCompute("k", factory),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(c2).toBe(42);
    expect(calls).toBe(1); // single-flight
  });
});
