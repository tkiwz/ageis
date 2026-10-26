import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = z.enum(["PENDING", "COMPLIANT", "OVERDUE", "EXEMPT"]);

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = STATUS.safeParse(req.nextUrl.searchParams.get("status"));
  let where: Record<string, unknown> = scope.where("siteId");
  if (status.success) {
    // OVERDUE also covers pending items past their due date
    where = status.data === "OVERDUE"
      ? { ...where, OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: new Date() } }] }
      : status.data === "PENDING"
        ? { ...where, status: "PENDING", dueDate: { gte: new Date() } }
        : { ...where, status: status.data };
  }

  const items = await db.complianceItem.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      responsible: { select: { id: true, name: true, role: true } },
    },
  });
  return ok({ items });
}

const createSchema = z.object({
  title:            z.string().trim().min(3).max(200),
  regulationRef:    z.string().trim().min(2).max(120),
  dueDate:          z.string().refine((v) => !Number.isNaN(Date.parse(v)), "invalid date"),
  siteId:           z.string().min(1).max(40),
  responsibleId:    z.string().min(1).max(40),
  triggersLockdown: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE managers can create compliance items", 403);
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const responsible = await db.user.findFirst({ where: { id: body.responsibleId, isActive: true }, select: { id: true } });
  if (!responsible) return fail("VALIDATION", "Responsible person not found", 400);

  const item = await db.complianceItem.create({
    data: {
      title: body.title,
      regulationRef: body.regulationRef,
      status: "PENDING",
      dueDate: new Date(body.dueDate),
      triggersLockdown: body.triggersLockdown,
      siteId: body.siteId,
      responsibleId: body.responsibleId,
    },
  });
  await appendAuditLog({
    module: "COMPLIANCE",
    action: "COMPLIANCE_ITEM_CREATED",
    description: `Compliance item "${item.title}" (${item.regulationRef}) due ${item.dueDate.toISOString().slice(0, 10)}`,
    userId: scope.userId,
    siteId: item.siteId,
  });
  return ok({ item });
}
