import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;
  const site = await db.site.findUnique({ where: { id } });
  if (!site) return fail("NOT_FOUND", "Site not found", 404);

  return ok(site);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) {
    return fail("FORBIDDEN", "Insufficient permissions", 403);
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return fail("INVALID_BODY", "Invalid JSON", 400);

  try {
    const site = await db.site.update({
      where: { id },
      data: {
        name:           body.name,
        nameAr:         body.nameAr,
        productionType: body.productionType ?? body.type,
        status:         body.status,
        riskLevel:      body.riskLevel,
        latitude:       body.latitude,
        longitude:      body.longitude,
        capacity:       body.capacity,
      },
    });
    return ok({ site, message: "Site updated successfully" });
  } catch {
    return fail("NOT_FOUND", "Site not found", 404);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);
  if (session.user.role !== "ADMIN") {
    return fail("FORBIDDEN", "Only admin can delete sites", 403);
  }

  const { id } = await ctx.params;
  try {
    await db.site.delete({ where: { id } });
    return ok({ message: "Site deleted successfully" });
  } catch {
    return fail("NOT_FOUND", "Site not found or has dependencies", 404);
  }
}