import { ok, fail } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { getSiteWarnings, syncForecastAlerts } from "@/lib/observatory/site-warnings";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/early-warnings — observatory warnings for the caller's sites (next 72 h) and the permits they affect. */
export async function GET() {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  try {
    // Awaited: serverless functions may stop as soon as the response is sent
    await syncForecastAlerts().catch((err) => log.warn("forecast alerts failed", { error: String(err) }));
    return ok(await getSiteWarnings(scope.siteScope));
  } catch {
    return fail("UPSTREAM", "Forecast unavailable", 503);
  }
}
