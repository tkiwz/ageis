import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = z.enum(["PREQUALIFICATION", "ACTIVE", "SUSPENDED", "EXPIRED"]);
const MANAGERS = ["ADMIN", "HSSE_MANAGER"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const status = STATUS.safeParse(req.nextUrl.searchParams.get("status"));
  const contractors = await db.contractor.findMany({
    where: status.success ? { status: status.data } : {},
    orderBy: { name: "asc" },
    take: 200,
    include: {
      _count: { select: { permits: { where: { status: { in: ["APPROVED", "ACTIVE"] } } } } },
    },
  });

  return ok({
    contractors: contractors.map(({ _count, ...c }) => ({ ...c, activePermitsCount: _count.permits })),
  });
}

const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => v || null);
const optDate = z.string().trim().optional().or(z.literal("")).transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "invalid date" }); return z.NEVER; }
  return d;
});

const fields = {
  name: z.string().trim().min(2).max(120),
  nameAr: optText(120),
  companyName: z.string().trim().min(2).max(200),
  specialty: optText(300),
  specialtyAr: optText(300),
  website: z.string().trim().max(200).url().optional().or(z.literal("")).transform((v) => v || null),
  contactEmail: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal("")).transform((v) => v || null),
  contactPhone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/).optional().or(z.literal("")).transform((v) => v || null),
  safetyRating: z.number().min(0).max(5),
  status: STATUS,
  contractStart: optDate,
  contractEnd: optDate,
};

const createSchema = z.object(fields).partial({ safetyRating: true, status: true }).strict();
const patchSchema = z.object({ id: z.string().min(1).max(40), ...fields }).partial().required({ id: true }).strict();

function firstIssue(e: z.ZodError) {
  const f = e.issues[0];
  return `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`;
}

/** A contract can't be ACTIVE without a start date, and can't end before it starts. */
function contractProblem(c: { status?: string; contractStart?: Date | null; contractEnd?: Date | null }) {
  if (c.status === "ACTIVE" && !c.contractStart) return "An active contractor needs a contract start date";
  if (c.contractStart && c.contractEnd && c.contractEnd < c.contractStart) return "Contract end is before its start";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!MANAGERS.includes(session.user.role)) return forbidden();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error), 400);
  const body = parsed.data;
  const problem = contractProblem(body);
  if (problem) return fail("VALIDATION", problem, 400);

  const c = await db.contractor.create({
    data: { ...body, safetyRating: body.safetyRating ?? 0, status: body.status ?? "PREQUALIFICATION" },
  });
  await appendAuditLog({
    module: "CONTRACTORS", action: "CONTRACTOR_CREATED", actionType: "MANUAL", isAutonomous: false,
    description: `Contractor ${c.name} added (${c.status})`,
    metadata: JSON.stringify({ contractorId: c.id }),
    userId: session.user.id,
  });
  return ok({ contractor: { ...c, activePermitsCount: 0 } });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!MANAGERS.includes(session.user.role)) return forbidden();

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", firstIssue(parsed.error), 400);
  const { id, ...update } = parsed.data;

  const current = await db.contractor.findUnique({ where: { id } });
  if (!current) return fail("NOT_FOUND", "Contractor not found", 404);
  const problem = contractProblem({ ...current, ...update });
  if (problem) return fail("VALIDATION", problem, 400);

  // A person lifting a suspension clears the automatic flag
  const data = update.status && update.status !== "SUSPENDED" ? { ...update, isAutoSuspended: false } : update;
  const c = await db.contractor.update({ where: { id }, data });

  const changed = Object.keys(update);
  await appendAuditLog({
    module: "CONTRACTORS", action: "CONTRACTOR_UPDATED", actionType: "MANUAL", isAutonomous: false,
    description: `Contractor ${c.name} updated (${changed.join(", ")})`,
    metadata: JSON.stringify({ contractorId: c.id, fields: changed, from: { status: current.status, safetyRating: current.safetyRating } }),
    userId: session.user.id,
    riskLevel: update.status && update.status !== current.status ? "MEDIUM" : "LOW",
  });
  const active = await db.permit.count({ where: { contractorId: id, status: { in: ["APPROVED", "ACTIVE"] } } });
  return ok({ contractor: { ...c, activePermitsCount: active } });
}
