import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, forbidden, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { exportUserData } from "@/lib/compliance/data-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const targetId = req.nextUrl.searchParams.get("userId");

  // Self-service: any user can export their own data.
  // ADMIN-only: export someone else's data.
  let userId = session.user.id!;
  if (targetId && targetId !== userId) {
    if (session.user.role !== "ADMIN") {
      return forbidden("Only ADMIN can export another user's data");
    }
    userId = targetId;
  }

  const payload = await exportUserData(userId);

  // Audit the export — Oman PDPL recommends logging every access to personal data.
  await db.auditLog.create({
    data: {
      module: "GOVERNANCE",
      action: "USER_DATA_EXPORTED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Data export for user ${userId} requested by ${session.user.email ?? session.user.id}`,
      metadata: JSON.stringify({ subjectUserId: userId, requesterId: session.user.id }),
      riskLevel: "MEDIUM",
      userId: session.user.id,
    },
  });

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="aegis-user-data-${userId}.json"`,
    },
  });
}
