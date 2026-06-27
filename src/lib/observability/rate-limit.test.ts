import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Fresh key each test
  });

  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const r = rateLimit({ key, max: 5, windowMs: 60_000 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the (max + 1)th request in the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit({ key, max: 3, windowMs: 60_000 });
    const blocked = rateLimit({ key, max: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns separate budgets per key", () => {
    const k1 = `test-a-${Math.random()}`;
    const k2 = `test-b-${Math.random()}`;
    rateLimit({ key: k1, max: 1, windowMs: 60_000 });
    rateLimit({ key: k1, max: 1, windowMs: 60_000 }); // would block
    const r2 = rateLimit({ key: k2, max: 1, windowMs: 60_000 });
    expect(r2.allowed).toBe(true);
  });

  it("decrements remaining correctly", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit({ key, max: 3, windowMs: 60_000 }).remaining).toBe(2);
    expect(rateLimit({ key, max: 3, windowMs: 60_000 }).remaining).toBe(1);
    expect(rateLimit({ key, max: 3, windowMs: 60_000 }).remaining).toBe(0);
  });
});
