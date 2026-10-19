import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Security regression tests (ADR-002 / ADR-003): page RBAC, API role guard,
 * site isolation, validation, SSRF guard, tick throttle, device auth.
 *
 * Needs demo accounts (prisma/seed.ts). Password from E2E_PASSWORD.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? "";
const ADMIN = "admin@aegis.local";
const OPERATOR = "operator@aegis.local";

test.skip(!PASSWORD, "E2E_PASSWORD not set");
test.describe.configure({ mode: "serial" });

async function apiLogin(request: APIRequestContext, email: string) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  const res = await request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: PASSWORD },
    maxRedirects: 0,
  });
  expect([200, 302]).toContain(res.status());
  const session = await (await request.get("/api/auth/session")).json();
  expect(session?.user?.email).toBe(email);
}

async function uiLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("unauthenticated", () => {
  test("pages redirect to login, even with a fake session cookie", async ({ page, context }) => {
    await context.addCookies([{ name: "authjs.session-token", value: "fake", url: "http://localhost:3000" }]);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login/);
  });

  test("device + data APIs need session or device secret", async ({ request }) => {
    for (const path of ["/api/devices/status", "/api/devices", "/api/data", "/api/pipelines"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    const ingest = await request.post("/api/devices/esp32/ingest", {
      headers: { "x-device-secret": "wrong" },
      data: {},
    });
    expect(ingest.status()).toBe(401);
    const telemetry = await request.post("/api/devices/esp/telemetry", { data: { deviceCode: "X" } });
    expect(telemetry.status()).toBe(401);
  });
});

test.describe("operator", () => {
  test("UI: can open operations, blocked from command/admin", async ({ page }) => {
    await uiLogin(page, OPERATOR);
    await page.goto("/operations/tasks");
    await expect(page).toHaveURL(/\/operations\/tasks/);
    for (const path of ["/command", "/admin/users", "/intelligence/chat"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/dashboard\?denied=true/);
    }
  });

  test("API: write actions above the role are 403", async ({ request }) => {
    await apiLogin(request, OPERATOR);
    const forbidden: [string, string, unknown?][] = [
      ["DELETE", "/api/pipelines/does-not-exist"],
      ["PUT", "/api/pipelines/does-not-exist", { name: "x" }],
      ["POST", "/api/pipelines", {}],
      ["POST", "/api/notify/whatsapp", { message: "test" }],
      ["POST", "/api/tasks/simulate"],
      ["DELETE", "/api/inspections/simulate"],
      ["POST", "/api/ai/generate-video", {}],
      ["POST", "/api/brain/think", {}],
    ];
    for (const [method, path, data] of forbidden) {
      const res = await request.fetch(path, { method, data });
      expect(res.status(), `${method} ${path}`).toBe(403);
    }
  });

  test("API: records from sites the user cannot see are 404", async ({ request, playwright }) => {
    const admin = await playwright.request.newContext({ baseURL: "http://localhost:3000" });
    await apiLogin(admin, ADMIN);
    const list = await (await admin.get("/api/incidents?limit=1")).json();
    const incidentId: string | undefined = list?.data?.incidents?.[0]?.id ?? list?.data?.[0]?.id;
    test.skip(!incidentId, "no incidents in DB");
    expect((await admin.get(`/api/incidents/${incidentId}`)).status()).toBe(200);
    await admin.dispose();

    // Demo operator has no site grants → must not see other sites' records
    await apiLogin(request, OPERATOR);
    expect((await request.get(`/api/incidents/${incidentId}`)).status()).toBe(404);
  });
});

test.describe("admin", () => {
  test("UI: can open all modules", async ({ page }) => {
    await uiLogin(page, ADMIN);
    for (const path of ["/command", "/intelligence/chat", "/admin/users", "/operations/pipelines"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    }
  });

  test("API: bad input is 400, not 500", async ({ request }) => {
    await apiLogin(request, ADMIN);
    const cases: [string, unknown][] = [
      ["/api/pipelines", { code: "X" }],
      ["/api/alerts", { type: "NOPE", title: "t", message: "m" }],
      ["/api/notify/whatsapp", { message: "" }],
    ];
    for (const [path, data] of cases) {
      const res = await request.post(path, { data });
      expect(res.status(), path).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION");
    }
  });

  test("API: Pi connect refuses loopback / metadata addresses (SSRF)", async ({ request }) => {
    await apiLogin(request, ADMIN);
    for (const ipAddress of ["127.0.0.1", "169.254.169.254", "localhost"]) {
      const res = await request.post("/api/devices/pi/connect", { data: { name: "x", ipAddress } });
      expect(res.status(), ipAddress).toBe(400);
    }
  });

  test("API: pipeline tick is throttled across callers", async ({ request }) => {
    await apiLogin(request, ADMIN);
    await request.post("/api/autonomy/pipeline/tick");
    const second = await (await request.post("/api/autonomy/pipeline/tick")).json();
    expect(second.ok).toBe(true);
    // Either throttled, or the autonomy gate is closed (demo mode / kill switch)
    expect(typeof second.data.blocked).toBe("string");
  });
});
