import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * i18n + layout tour: every page × Arabic/English, signed in as the seed admin.
 * Checks html lang/dir, no stray language text, no horizontal overflow, no
 * page errors, and saves screenshots to test-results/tour/ for design review.
 *
 *   E2E_PASSWORD=… npx playwright test tests/e2e/i18n.spec.ts --project=chromium
 *   TOUR_ROUTES=/dashboard,/operations/tasks  → only those routes
 */

const PASSWORD = process.env.E2E_PASSWORD ?? "";
const ADMIN = process.env.E2E_ADMIN ?? "admin@aegis.local";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const ROUTES = (process.env.TOUR_ROUTES?.split(",") ?? [
  "/dashboard",
  "/command",
  "/command/map",
  "/command/emergencies",
  "/admin/alerts",
  "/operations/permits",
  "/operations/permits/new",
  "/operations/tasks",
  "/operations/sites",
  "/operations/sites/new",
  "/safety/incidents",
  "/safety/investigations",
  "/safety/observations",
  "/safety/risk",
  "/safety/wellness",
  "/safety/ppe",
  "/operations/pipelines",
  "/operations/sensors",
  "/operations/devices",
  "/operations/drones",
  "/operations/esp32",
  "/governance/compliance",
  "/governance/inspections",
  "/governance/contractors",
  "/governance/training",
  "/governance/documents",
  "/governance/privacy",
  "/intelligence/chat",
  "/intelligence/brain",
  "/intelligence/knowledge",
  "/intelligence/suggestions",
  "/intelligence/ai",
  "/intelligence/rules",
  "/intelligence/audit",
  "/admin/users",
  "/admin/security",
  "/admin/autonomy",
  "/admin/settings",
  "/m",
  "/m/report",
  "/m/permits",
  "/m/safe",
  "/m/voice",
  "/m/wellness",
]).map((r) => r.trim()).filter(Boolean);

// Latin words allowed inside Arabic pages (brand, units, codes)
const LATIN_OK = /^(AEGIS|AI|ID|OK|PDF|CSV|GPS|PPE|HSSE|ESP32|ppm|km|bar|dB|LEL|AQI|H2S|CO2|O2|°C|PTW|SOS|English|[A-Z]{2,}-?\d+|\d+)$/;

test.skip(!PASSWORD, "E2E_PASSWORD not set");
test.setTimeout(240_000);

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

for (const locale of ["ar", "en"] as const) {
  test.describe(`tour ${locale}`, () => {
    test(`all pages render cleanly in ${locale}`, async ({ page, context }, info) => {
      const dir = `test-results/tour/${info.project.name}/${locale}`;
      mkdirSync(dir, { recursive: true });
      await context.addCookies([{ name: "aegis-lang", value: locale, url: BASE }]);
      await login(page);

      const problems: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      for (const route of ROUTES) {
        pageErrors.length = 0;
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const html = page.locator("html");
        if ((await html.getAttribute("lang")) !== locale) problems.push(`${route}: html lang`);
        if ((await html.getAttribute("dir")) !== (locale === "ar" ? "rtl" : "ltr")) problems.push(`${route}: html dir`);

        const report = await page.evaluate((loc) => {
          const out: string[] = [];
          const root = document.querySelector("main") ?? document.body;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const n = walker.currentNode as Text;
            const el = n.parentElement;
            if (!el || el.closest("[dir=ltr],script,style,code,pre,.leaflet-container,canvas,[data-i18n-skip]")) continue;
            const txt = (n.textContent ?? "").trim();
            if (!txt) continue;
            if (loc === "en" && /[؀-ۿ]/.test(txt)) out.push(`arabic: ${txt.slice(0, 60)}`);
            if (loc === "ar") {
              const words = txt.match(/[A-Za-z][A-Za-z0-9°-]{2,}/g) ?? [];
              const bad = words.filter((w) => !/^(AEGIS|ESP32|HSSE|PPE|English|ppm|LEL|AQI|PTW|SOS|H2S|CO2)$/.test(w));
              // ignore data-like tokens (codes, all-caps identifiers)
              if (bad.some((w) => /[a-z]/.test(w) && w.length > 2)) out.push(`latin: ${txt.slice(0, 60)}`);
            }
          }
          const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
          return { text: out.slice(0, 8), overflow };
        }, locale);

        for (const t of report.text) problems.push(`${route}: ${t}`);
        if (report.overflow) problems.push(`${route}: horizontal overflow`);
        for (const e of pageErrors) problems.push(`${route}: page error ${e.slice(0, 80)}`);

        const file = route.replace(/^\//, "").replace(/\//g, "_") || "root";
        await page.screenshot({ path: `${dir}/${file}.png`, fullPage: false });
      }

      // Database content (alert titles, site names) may legitimately be in one language;
      // report everything, fail only on structural problems.
      console.log(`\n[${locale}] ${problems.length} findings\n` + problems.join("\n"));
      const structural = problems.filter((p) => /html (lang|dir)|horizontal overflow|page error/.test(p));
      expect(structural, structural.join("\n")).toEqual([]);
      void LATIN_OK;
    });
  });
}
