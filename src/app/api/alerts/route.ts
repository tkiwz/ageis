import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);

  const alerts = await db.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { site: { select: { code: true, name: true } } },
  });

  const byType = alerts.reduce((acc: Record<string, number>, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});

  return ok({
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      channels: a.channels,
      status: a.status,
      isAutonomous: a.isAutonomous,
      acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      siteId: a.siteId ?? null,
      createdAt: a.createdAt.toISOString(),
      site: a.site ?? null,
    })),
    summary: {
      total: alerts.length,
      byType,
      autonomous: alerts.filter((a) => a.isAutonomous).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  let body: {
    type: string;
    title: string;
    message: string;
    channels?: string;
    status?: string;
    isAutonomous?: boolean;
    siteId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  if (!body.type || !body.title || !body.message) {
    return fail("MISSING_FIELDS", "type, title, message required", 400);
  }

  const alert = await db.alert.create({
    data: {
      type: body.type,
      title: body.title,
      message: body.message,
      channels: body.channels ?? JSON.stringify(["DASHBOARD"]),
      status: body.status ?? "ACTIVE",
      isAutonomous: body.isAutonomous ?? false,
      siteId: body.siteId ?? null,
    },
  });

  return ok(alert);
}