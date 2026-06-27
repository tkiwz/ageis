import { NextRequest, NextResponse } from "next/server";
import { ok, fail }                  from "@/lib/api-response";
import { db }                        from "@/lib/db";
import { requireScopedAuth }         from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const sp       = req.nextUrl.searchParams;
  const baseWhere = scope.where("siteId");

  // ── ?stats=1 — return counts only ──────────────────────────
  if (sp.get("stats") === "1") {
    const now        = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    const [total, pending, inProgress, overdue, completedToday] = await Promise.all([
      db.task.count({ where: baseWhere }),
      db.task.count({ where: { ...baseWhere, status: "PENDING" } }),
      db.task.count({ where: { ...baseWhere, status: "IN_PROGRESS" } }),
      db.task.count({ where: { ...baseWhere, status: { not: "COMPLETED" }, dueDate: { lt: now, not: null } } }),
      db.task.count({ where: { ...baseWhere, status: "COMPLETED", completedAt: { gte: todayStart } } }),
    ]);
    return ok({ total, pending, inProgress, overdue, completedToday });
  }

  // ── ?members=1 — return assignable users ───────────────────
  if (sp.get("members") === "1") {
    const users = await db.user.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return ok({ users });
  }

  // ── Regular list ───────────────────────────────────────────
  const now     = new Date();
  const status  = sp.get("status");
  const mine    = sp.get("mine") === "1";
  const overdue = sp.get("overdue") === "1";

  let where: Record<string, unknown> = { ...baseWhere };
  if (status)  where = { ...where, status };
  if (mine)    where = { ...where, assigneeId: scope.userId };
  if (overdue) where = { ...where, status: { not: "COMPLETED" }, dueDate: { lt: now, not: null } };

  const tasks = await db.task.findMany({
    where,
    orderBy: [
      { priority: "desc" },
      { dueDate:  "asc"  },
      { createdAt: "desc" },
    ],
    take:    200,
    include: {
      site:     { select: { code: true, name: true } },
      assignee: { select: { id: true, name: true, role: true } },
    },
  });

  return ok({ tasks });
}

// ─── POST — create task ────────────────────────────────────────
interface CreateTaskBody {
  title:       string;
  description?: string;
  category:    string;
  priority?:   string;
  dueDate?:    string;
  siteId?:     string;
  assigneeId?: string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: CreateTaskBody;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.title || !body.category) return fail("MISSING", "title and category required", 400);
  if (body.siteId && !scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const task = await db.task.create({
    data: {
      title:       body.title,
      description: body.description ?? null,
      category:    body.category,
      priority:    body.priority   ?? "MEDIUM",
      status:      "PENDING",
      dueDate:     body.dueDate ? new Date(body.dueDate) : null,
      siteId:      body.siteId    ?? null,
      assigneeId:  body.assigneeId ?? null,
    },
    include: {
      site:     { select: { code: true, name: true } },
      assignee: { select: { id: true, name: true, role: true } },
    },
  });
  return ok({ task });
}

// ─── PATCH — update status or assignee ─────────────────────────
export async function PATCH(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: { id: string; status?: string; assigneeId?: string };
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.id) return fail("MISSING", "id required", 400);

  const existing = await db.task.findUnique({ where: { id: body.id }, select: { siteId: true } });
  if (!existing) return fail("NOT_FOUND", "Task not found", 404);
  if (existing.siteId && !scope.canSee(existing.siteId)) return fail("NOT_FOUND", "Task not found", 404);

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "COMPLETED") data.completedAt = new Date();
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;

  const updated = await db.task.update({ where: { id: body.id }, data });
  return ok({ task: updated });
}

// ─── DELETE — remove task ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("MISSING", "id required", 400);

  const existing = await db.task.findUnique({ where: { id }, select: { siteId: true } });
  if (!existing) return fail("NOT_FOUND", "Task not found", 404);
  if (existing.siteId && !scope.canSee(existing.siteId)) return fail("NOT_FOUND", "Task not found", 404);

  await db.task.delete({ where: { id } });
  return ok({ deleted: true });
}
