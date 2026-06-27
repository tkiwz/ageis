import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const onlyMine = req.nextUrl.searchParams.get("mine") === "1";

  const [trainings, enrollments] = await Promise.all([
    db.training.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { enrollments: true } } },
    }),
    db.trainingEnrollment.findMany({
      where: onlyMine ? { userId: session.user.id } : {},
      orderBy: { expiresAt: "asc" },
      take: 200,
      include: {
        training: { select: { id: true, title: true, type: true, validityDays: true, isMandatory: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  // KPIs: expired/overdue counts
  const now = Date.now();
  const expiringSoon = enrollments.filter(
    (e) => e.expiresAt && e.expiresAt.getTime() - now < 30 * 24 * 60 * 60 * 1000 && e.expiresAt.getTime() > now,
  ).length;
  const expired = enrollments.filter(
    (e) => e.status === "EXPIRED" || (e.expiresAt && e.expiresAt.getTime() < now),
  ).length;
  const completed = enrollments.filter((e) => e.status === "COMPLETED").length;

  return ok({
    trainings,
    enrollments,
    kpis: { total: enrollments.length, expiringSoon, expired, completed },
  });
}
