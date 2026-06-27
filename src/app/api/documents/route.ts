import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const category = req.nextUrl.searchParams.get("category");
  // Documents can have null siteId (global). Show globals + scoped sites.
  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (!scope.unrestricted && Array.isArray(scope.siteScope)) {
    where.OR = [{ siteId: null }, { siteId: { in: scope.siteScope } }];
  }

  const docs = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      uploadedBy: { select: { name: true } },
      _count: { select: { acknowledgments: true } },
    },
  });
  return ok({ documents: docs });
}

interface CreateDocBody {
  title: string;
  category: string;
  fileUrl?: string;
  version?: string;
  requiresAcknowledgment?: boolean;
  siteId?: string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: CreateDocBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.title || !body.category) return fail("MISSING", "title and category required", 400);
  if (body.siteId && !scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const doc = await db.document.create({
    data: {
      title: body.title,
      category: body.category,
      status: "DRAFT",
      fileUrl: body.fileUrl,
      version: body.version ?? "1.0",
      requiresAcknowledgment: body.requiresAcknowledgment ?? false,
      siteId: body.siteId,
      uploadedById: scope.userId,
    },
  });
  return ok({ document: doc });
}
