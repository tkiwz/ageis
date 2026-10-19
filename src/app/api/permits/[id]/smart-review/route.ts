import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { reviewPermit } from "@/lib/permits/smart-approval";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { aiGuard } from "@/lib/security/ai-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SUPERVISE);
  if (denied) return denied;
  const limited = await aiGuard("analyze");
  if (limited) return limited;
  const session = await auth();
  if (!session?.user) return unauthorized();
  const { id } = await params;
  const hidden = await denyUnlessSiteVisible("permit", id);
  if (hidden) return hidden;
  const result = await reviewPermit(id);
  return ok(result);
}
