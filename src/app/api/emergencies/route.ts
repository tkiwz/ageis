import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { ok, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Number(searchParams.get("limit") ?? 20);

    const emergencies = await db.emergencyEvent.findMany({
      where: {
        ...(status && { status }),
      },
      include: {
        site: { select: { code: true, name: true, nameAr: true, latitude: true, longitude: true } },
        commandedBy: { select: { name: true, role: true } },
      },
      orderBy: [
        // Active first
        { status: "asc" }, // ACTIVE < CONTAINED < RESOLVED alphabetically
        { startedAt: "desc" },
      ],
      take: limit,
    });

    const summary = {
      total: emergencies.length,
      active: emergencies.filter((e) => e.status === "ACTIVE").length,
      contained: emergencies.filter((e) => e.status === "CONTAINED").length,
      resolved: emergencies.filter((e) => e.status === "RESOLVED").length,
      evacuations: emergencies.filter((e) => e.evacuationTriggered).length,
      dronesDispatched: emergencies.filter((e) => e.droneDispatched).length,
    };

    return ok({ emergencies, summary });
  } catch (error) {
    console.error("[/api/emergencies] error:", error);
    return serverError();
  }
}