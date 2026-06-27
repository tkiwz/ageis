import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncidentAI {
  summary?: string;
  riskLevel?: string;
  predictions?: string[];
  immediateActions?: string[];
}

function parseAI(raw: unknown): IncidentAI | null {
  if (!raw) return null;
  try {
    if (typeof raw === "string") return JSON.parse(raw);
    return raw as IncidentAI;
  } catch { return null; }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  // Incidents with AI analysis
  const aiIncidents = await db.incident.findMany({
    where: { aiAnalysis: { not: null } },
    orderBy: { occurredAt: "desc" },
    take: 20,
    include: { site: { select: { name: true, code: true } } },
  });

  // Recent AI decisions
  const recentDecisions = await db.aIDecision.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // Sites with active incidents
  const sites = await db.site.findMany({
    include: {
      _count: { select: { incidents: { where: { status: { in: ["REPORTED", "INVESTIGATING"] } } } } },
    },
  });

  const criticalSites = sites
    .filter((s) => s._count.incidents > 0 || s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH")
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      riskLevel: s.riskLevel,
      activeIncidents: s._count.incidents,
    }))
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.riskLevel as keyof typeof order] ?? 9) - (order[b.riskLevel as keyof typeof order] ?? 9);
    });

  // Extract predictions from AI analyses
  const predictions: Array<{
    id: string;
    incidentNumber: string;
    title: string;
    siteName: string;
    riskLevel: string;
    summary: string;
    predictions: string[];
    occurredAt: string;
  }> = [];

  for (const inc of aiIncidents) {
    const ai = parseAI(inc.aiAnalysis);
    if (!ai) continue;
    if (!ai.predictions || ai.predictions.length === 0) continue;

    predictions.push({
      id: inc.id,
      incidentNumber: inc.incidentNumber,
      title: inc.title,
      siteName: inc.site?.name ?? "Unknown",
      riskLevel: ai.riskLevel ?? inc.severity,
      summary: ai.summary ?? "",
      predictions: ai.predictions,
      occurredAt: inc.occurredAt.toISOString(),
    });
  }

  // Provider stats
  const providerStats = recentDecisions.reduce(
    (acc, d) => {
      acc[d.provider] = (acc[d.provider] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Type distribution
  const typeStats = recentDecisions.reduce(
    (acc, d) => {
      acc[d.type] = (acc[d.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return ok({
    totalAIAnalyses: aiIncidents.length,
    totalDecisions:  recentDecisions.length,
    autonomous:      recentDecisions.filter((d) => d.autonomous).length,
    providerStats,
    typeStats,
    criticalSites:   criticalSites.slice(0, 5),
    predictions:     predictions.slice(0, 10),
  });
}