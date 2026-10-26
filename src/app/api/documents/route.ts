import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_CATEGORIES = ["POLICY", "PROCEDURE", "JSA", "MOC", "CERTIFICATE", "PERMIT", "TRAINING", "OTHER"] as const;

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const category = req.nextUrl.searchParams.get("category");
  // Documents can have null siteId (global). Show globals + scoped sites.
  const where: Record<string, unknown> = {};
  if (category) where.category = category.slice(0, 40);
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

const createSchema = z.object({
  title:    z.string().trim().min(3).max(200),
  category: z.enum(DOCUMENT_CATEGORIES),
  // Links only (no uploads yet) — https only, so a stored link can never run script
  fileUrl:  z.string().trim().url().max(1000).refine((u) => u.startsWith("https://"), "must start with https://").optional().or(z.literal("")),
  version:  z.string().trim().min(1).max(20).default("1.0"),
  requiresAcknowledgment: z.boolean().default(false),
  publish:  z.boolean().default(true),
  siteId:   z.string().max(40).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;
  const siteId = body.siteId || null;
  if (siteId && !scope.canSee(siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const doc = await db.document.create({
    data: {
      title: body.title,
      category: body.category,
      status: body.publish ? "PUBLISHED" : "DRAFT",
      fileUrl: body.fileUrl || null,
      version: body.version,
      requiresAcknowledgment: body.requiresAcknowledgment,
      siteId,
      uploadedById: scope.userId,
    },
  });
  await appendAuditLog({
    module: "DOCUMENT",
    action: "DOCUMENT_ADDED",
    description: `Document "${doc.title}" v${doc.version} (${doc.category}, ${doc.status})`,
    userId: scope.userId,
    siteId,
  });
  return ok({ document: doc });
}
