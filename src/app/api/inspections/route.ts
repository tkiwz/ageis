import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSPECTION_TYPES = [
  "FIRE_SAFETY", "ELECTRICAL", "MECHANICAL", "HOUSEKEEPING", "PPE",
  "ENVIRONMENTAL", "PROCESS_SAFETY", "SITE_SAFETY",
] as const;
const STATUS = z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED"]);

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = STATUS.safeParse(req.nextUrl.searchParams.get("status"));
  let where: Record<string, unknown> = scope.where("siteId");
  if (status.success) where = { ...where, status: status.data };

  const inspections = await db.inspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      conductedBy: { select: { name: true, role: true } },
    },
  });
  return ok({ inspections });
}

const createSchema = z.object({
  title:  z.string().trim().min(3).max(200),
  type:   z.enum(INSPECTION_TYPES),
  siteId: z.string().min(1).max(40),
});

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can schedule inspections", 403);
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "title, type and siteId are required", 400);
  const body = parsed.data;
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const ins = await db.inspection.create({
    data: {
      title: body.title,
      type: body.type,
      status: "SCHEDULED",
      siteId: body.siteId,
      conductedById: scope.userId,
    },
  });
  await appendAuditLog({
    module: "INSPECTION",
    action: "INSPECTION_SCHEDULED",
    description: `Inspection "${ins.title}" (${ins.type}) scheduled`,
    userId: scope.userId,
    siteId: ins.siteId,
  });
  return ok({ inspection: ins });
}
