/**
 * Smart Permit Approval — Claude reviews a freshly-submitted permit and
 * produces a recommendation (APPROVE / MODIFY / REJECT) with reasoning.
 *
 * It NEVER auto-approves unless AutonomySettings.permitAutoApproval is
 * explicitly enabled — by default the recommendation goes to an HSSE_MANAGER
 * for final decision.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import { getAutonomySettings } from "@/lib/autonomy/settings";

export interface PermitRecommendation {
  recommendation: "APPROVE" | "MODIFY" | "REJECT";
  confidence: number;
  conflictsFound: number;
  conflictDetails?: { permitNumber: string; reason: string }[];
  requiredPPE: string[];
  hazards: string[];
  hazardsAr?: string[];
  riskScore: number; // 0-100
  reasoning: string;
  reasoningAr?: string;
  modifications?: string[];
  contractorHistoryNote?: string;
  autoApproved: boolean;
  decisionId?: string;
  blocked?: string;
}

export async function reviewPermit(permitId: string): Promise<PermitRecommendation> {
  const permit = await db.permit.findUnique({
    where: { id: permitId },
    include: {
      site: true,
      requester: { select: { id: true, name: true, email: true, role: true } },
      conditions: true,
    },
  });
  if (!permit) {
    return {
      recommendation: "REJECT", confidence: 1, conflictsFound: 0,
      requiredPPE: [], hazards: ["Permit not found"], riskScore: 100,
      reasoning: "Permit not found.", autoApproved: false,
    };
  }

  // ─── Gather conflict signals ───
  const overlapping = await db.permit.findMany({
    where: {
      siteId: permit.siteId,
      id: { not: permit.id },
      status: { in: ["ACTIVE", "APPROVED"] },
      AND: [
        { validFrom: { lte: permit.validUntil } },
        { validUntil: { gte: permit.validFrom } },
      ],
    },
    select: { permitNumber: true, type: true, riskLevel: true, location: true, requester: { select: { name: true } } },
  });

  const siteIncidentsLast30 = await db.incident.count({
    where: {
      siteId: permit.siteId,
      occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const requesterPastIncidents = await db.incident.count({
    where: {
      reporterId: permit.requesterId,
      occurredAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
  });

  const activeWellnessAlerts = await db.workerWellnessAlert.count({
    where: { userId: permit.requesterId, acknowledged: false, severity: { in: ["HIGH", "CRITICAL"] } },
  });

  const dataBlob = {
    permit: {
      number: permit.permitNumber,
      type: permit.type,
      title: permit.title,
      description: permit.description,
      riskLevel: permit.riskLevel,
      location: permit.location,
      validFrom: permit.validFrom.toISOString(),
      validUntil: permit.validUntil.toISOString(),
      durationHours: Math.round((permit.validUntil.getTime() - permit.validFrom.getTime()) / 3_600_000),
      conditions: permit.conditions.map((c) => c.description),
    },
    site: {
      code: permit.site.code,
      name: permit.site.name,
      status: permit.site.status,
      riskLevel: permit.site.riskLevel,
      isLockedDown: permit.site.isLockedDown,
    },
    requester: {
      name: permit.requester.name,
      role: permit.requester.role,
    },
    signals: {
      overlappingPermits: overlapping.map((o) => ({
        number: o.permitNumber,
        type: o.type,
        risk: o.riskLevel,
        location: o.location,
        requester: o.requester.name,
      })),
      siteIncidentsLast30Days: siteIncidentsLast30,
      requesterIncidentsLast90Days: requesterPastIncidents,
      requesterActiveWellnessAlerts: activeWellnessAlerts,
    },
  };

  const systemPrompt = `You are AEGIS's permit-to-work (PTW) reviewer for OQ Oman.
You assess proposed permits against safety signals and recommend APPROVE, MODIFY (with required changes), or REJECT.

Key heuristics:
- Hot work + active gas leak permit overlap = REJECT
- Site lockdown active = REJECT
- HIGH/CRITICAL incident on the same site in the past 7 days = MODIFY (require additional controls)
- Requester has unresolved HIGH wellness alerts = MODIFY (require different supervisor / reduced shift)
- Confined-space work without listed gas test condition = MODIFY

Be calibrated: most permits should APPROVE. REJECT only when there's a clear immediate hazard.
Respond ONLY in JSON.`;

  const userPrompt = `Review this PTW:
${JSON.stringify(dataBlob, null, 2)}

Respond in this exact JSON shape:
{
  "recommendation": "APPROVE"|"MODIFY"|"REJECT",
  "confidence": 0.0-1.0,
  "riskScore": 0-100,
  "conflictDetails": [{ "permitNumber": "...", "reason": "..." }],
  "requiredPPE": ["Helmet", "FR coverall", "..."],
  "hazards": ["English hazard 1", "..."],
  "hazardsAr": ["خطر بالعربية 1", "..."],
  "reasoning": "1-3 sentences English",
  "reasoningAr": "1-3 جمل بالعربية",
  "modifications": ["change 1", "change 2"],
  "contractorHistoryNote": "Brief note or null"
}`;

  const r = await guardedClaudeChat({
    module: "permit",
    feature: "smart-approval",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1200,
    temperature: 0.2,
    autonomous: true,
    decisionType: "PERMIT_ANALYSIS",
    inputSnapshot: dataBlob,
  });

  if (r.blocked) {
    return {
      recommendation: "MODIFY", confidence: 0, conflictsFound: 0,
      requiredPPE: [], hazards: [], riskScore: 50,
      reasoning: `AI review blocked: ${r.blocked.reason}`,
      autoApproved: false, blocked: r.blocked.reason,
    };
  }

  const m = r.content.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      recommendation: "MODIFY", confidence: 0, conflictsFound: overlapping.length,
      requiredPPE: [], hazards: ["AI parse error"], riskScore: 60,
      reasoning: "Could not parse AI response. Manual review required.",
      autoApproved: false,
    };
  }
  const parsed = JSON.parse(m[0]) as Omit<PermitRecommendation, "conflictsFound" | "autoApproved" | "decisionId">;

  // Auto-approve only if settings allow AND recommendation is APPROVE AND risk is low
  const settings = await getAutonomySettings();
  const autoApproved =
    settings.permitAutoApproval &&
    parsed.recommendation === "APPROVE" &&
    parsed.riskScore <= 30 &&
    parsed.confidence >= 0.8;

  // Persist recommendation in audit
  await db.auditLog.create({
    data: {
      module: "OPERATIONS",
      action: "PERMIT_AI_REVIEWED",
      actionType: "AI_AUTONOMOUS",
      isAutonomous: true,
      description: `AI ${autoApproved ? "auto-approved" : "reviewed"} permit ${permit.permitNumber}: ${parsed.recommendation} (risk=${parsed.riskScore})`,
      metadata: JSON.stringify({ permitId, recommendation: parsed.recommendation, riskScore: parsed.riskScore, autoApproved, decisionId: r.decisionId }),
      riskLevel: parsed.riskScore >= 70 ? "HIGH" : parsed.riskScore >= 40 ? "MEDIUM" : "LOW",
      siteId: permit.siteId,
    },
  });

  // If auto-approve allowed → flip status
  if (autoApproved) {
    await db.permit.update({
      where: { id: permit.id },
      data: { status: "APPROVED", isAutoApproved: true },
    });
  }

  // Notify HSSE managers when requires manual review (REJECT or MODIFY)
  if (parsed.recommendation !== "APPROVE" || !autoApproved) {
    const managers = await db.user.findMany({
      where: { role: { in: ["ADMIN", "HSSE_MANAGER"] }, isActive: true },
      select: { id: true },
    });
    await db.notification.createMany({
      data: managers.map((mgr) => ({
        userId: mgr.id,
        type: "ASSIGNMENT",
        severity: parsed.riskScore >= 70 ? "CRITICAL" : "WARNING",
        title: `Permit needs review: ${permit.permitNumber}`,
        titleAr: `تصريح يحتاج مراجعة: ${permit.permitNumber}`,
        body: `AI recommends ${parsed.recommendation} (risk ${parsed.riskScore}/100). ${parsed.reasoning}`,
        bodyAr: parsed.reasoningAr ?? null,
        link: `/operations/permits/${permit.id}`,
        metadata: JSON.stringify({ permitId, recommendation: parsed.recommendation }),
      })),
    });
  }

  return {
    ...parsed,
    conflictsFound: overlapping.length,
    autoApproved,
    decisionId: r.decisionId,
  };
}
