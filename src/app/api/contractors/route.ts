import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const status = req.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const contractors = await db.contractor.findMany({
    where,
    orderBy: { name: "asc" },
    take: 100,
    include: {
      _count: {
        select: {
          permits: { where: { status: { in: ["APPROVED", "ACTIVE"] } } },
        },
      },
    },
  });

  // Flatten count into each contractor object
  const result = contractors.map((c) => ({
    ...c,
    activePermitsCount: (c as typeof c & { _count: { permits: number } })._count.permits,
    _count: undefined,
  }));

  return ok({ contractors: result });
}

interface CreateContractorBody {
  name: string;
  companyName: string;
  contactEmail: string;
  contactPhone?: string;
  contractStart: string;
  contractEnd?: string;
  safetyRating?: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  let body: CreateContractorBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.name || !body.companyName || !body.contactEmail || !body.contractStart) {
    return fail("MISSING", "name, companyName, contactEmail, contractStart required", 400);
  }

  const c = await db.contractor.create({
    data: {
      name: body.name,
      companyName: body.companyName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      safetyRating: body.safetyRating ?? 0,
      status: "ACTIVE",
      contractStart: new Date(body.contractStart),
      contractEnd: body.contractEnd ? new Date(body.contractEnd) : null,
    },
  });
  return ok({ contractor: c });
}
