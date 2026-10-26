import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import {
  getAutonomySettings,
  updateAutonomySettings,
  type AutonomySettingsDTO,
} from "@/lib/autonomy/settings";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { z } from "zod";

const patchSchema = z.object({
  globalEnabled: z.boolean(),
  pipelineLoopEnabled: z.boolean(),
  forecastEnabled: z.boolean(),
  voiceActionsEnabled: z.boolean(),
  permitAutoApproval: z.boolean(),
  visionAutoActions: z.boolean(),
  demoMode: z.boolean(),
  pipelinePollSeconds: z.number().int().min(10).max(3600),
  dailyBudgetUsd: z.number().min(0).max(1000),
  monthlyBudgetUsd: z.number().min(0).max(20000),
  maxCallsPerMinute: z.number().int().min(0).max(600),
  maxCallsPerHour: z.number().int().min(0).max(20000),
}).partial().strict();

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

  // Only known settings, with sane ranges (the body was spread straight into the row before)
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const patch: Partial<AutonomySettingsDTO> = parsed.data;
  // Letting AI approve permits on its own is an admin-only decision
  if (patch.permitAutoApproval === true && session.user.role !== "ADMIN") {
    return forbidden("Only ADMIN can enable automatic permit approval");
  }

  const updated = await updateAutonomySettings(patch, session.user.id);

  // Audit log every autonomy change — critical for compliance.
  await appendAuditLog({
      module: "intelligence",
      action: "AUTONOMY_SETTINGS_UPDATED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Autonomy settings updated by ${session.user.email ?? session.user.id}`,
      metadata: JSON.stringify(patch),
      riskLevel: patch.globalEnabled === false ? "HIGH" : "MEDIUM",
      userId: session.user.id,
    });

  return ok(updated);
}
