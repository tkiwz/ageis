import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import {
  getAutonomySettings,
  updateAutonomySettings,
  type AutonomySettingsDTO,
} from "@/lib/autonomy/settings";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  const settings = await getAutonomySettings();
  return ok(settings);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  // Only ADMIN + HSSE_MANAGER can flip autonomy.
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) {
    return forbidden("Only ADMIN or HSSE_MANAGER can change autonomy settings");
  }

  let patch: Partial<AutonomySettingsDTO>;
  try {
    patch = (await req.json()) as Partial<AutonomySettingsDTO>;
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  const updated = await updateAutonomySettings(patch, session.user.id);

  // Audit log every autonomy change — critical for compliance.
  await db.auditLog.create({
    data: {
      module: "intelligence",
      action: "AUTONOMY_SETTINGS_UPDATED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Autonomy settings updated by ${session.user.email ?? session.user.id}`,
      metadata: JSON.stringify(patch),
      riskLevel: patch.globalEnabled === false ? "HIGH" : "MEDIUM",
      userId: session.user.id,
    },
  });

  return ok(updated);
}
