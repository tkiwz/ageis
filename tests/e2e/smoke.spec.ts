import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify the app boots, public routes work, and the auth gate
 * actually gates protected routes.
 */

test.describe("smoke", () => {
  test("liveness endpoint returns 200", async ({ request }) => {
    const res = await request.get("/api/live");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alive).toBe(true);
  });

  test("readiness endpoint returns 200 (or 503 with details)", async ({ request }) => {
    const res = await request.get("/api/ready");
    // Either ready (200) or honestly reports issues (503)
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("checks");
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toContainText(/sign in|email|password/i);
  });

  test("dashboard redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

  test("public assets are reachable", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);
  });
});
