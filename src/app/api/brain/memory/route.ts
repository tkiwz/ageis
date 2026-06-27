import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";
import { remember } from "@/lib/brain/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const status = req.nextUrl.searchParams.get("status") ?? "ACTIVE";
  const category = req.nextUrl.searchParams.get("category");
  const subject = req.nextUrl.searchParams.get("subject");

  const where: Record<string, unknown> = { status };
  if (category) where.category = category;
  if (subject) where.subject = subject;

  const [memories, totals, byCategory] = await Promise.all([
    db.brainMemory.findMany({
      where,
      orderBy: [{ confidence: "desc" }, { reinforcements: "desc" }],
      take: 100,
    }),
    db.brainMemory.groupBy({
      by: ["status"], _count: { _all: true },
    }),
    db.brainMemory.groupBy({
      by: ["category"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
      _avg: { confidence: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  return ok({
    memories,
    totals: Object.fromEntries(totals.map((t) => [t.status, t._count._all])),
    byCategory,
  });
}

interface CreateMemoryBody {
  category: string;
  content: string;
  contentAr?: string;
  subject?: string;
  tags?: string[];
  confidence?: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  let body: CreateMemoryBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.category || !body.content) return fail("MISSING", "category and content required", 400);

  const id = await remember({
    category: body.category,
    content: body.content,
    contentAr: body.contentAr,
    subject: body.subject,
    tags: body.tags,
    confidence: body.confidence,
    createdById: session.user.id,
  });

  return ok({ id });
}
