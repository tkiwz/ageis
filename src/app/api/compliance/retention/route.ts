import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, forbidden, unauthorized } from "@/lib/api-response";
import { runRetentionSweep } from "@/lib/compliance/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();
  const report = await runRetentionSweep(true);
  return ok(report);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden("Only ADMIN can execute retention sweep");

  // Optional cron auth
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret !== cronSecret && session.user.role !== "ADMIN") {
    return fail("UNAUTHORIZED", "Invalid cron secret", 401);
  }

  const report = await runRetentionSweep(false);
  return ok(report);
}
