import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  const onlyUnread = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 30);

  const where: Record<string, unknown> = { userId: session.user.id };
  if (onlyUnread) where.readAt = null;

  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    db.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);

  return ok({ items, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  let body: { ids?: string[]; markAllRead?: boolean };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (body.markAllRead) {
    await db.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (body.ids && body.ids.length > 0) {
    await db.notification.updateMany({
      where: { userId: session.user.id, id: { in: body.ids }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const unreadCount = await db.notification.count({
    where: { userId: session.user.id, readAt: null },
  });
  return ok({ unreadCount });
}
