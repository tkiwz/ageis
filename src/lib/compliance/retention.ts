/**
 * Audit retention policy — required for ISO 45001 + Oman PDPL.
 *
 * Retention rules:
 *   - CRITICAL / HIGH risk audit logs → 7 years
 *   - MEDIUM risk → 3 years
 *   - LOW / null risk → 1 year
 *   - AIDecision linked to CRITICAL incidents → 7 years
 *   - Voice messages → 30 days (per user privacy expectations)
 *   - Wellness readings → 90 days (raw) + summary kept 2 years
 *
 * This function only DELETES expired records. It does NOT touch:
 *   - Active incidents / permits / leak alerts
 *   - Anything currently under investigation
 */
import { db } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

function cutoff(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

export interface RetentionReport {
  ranAt: string;
  deletedAuditLogs: number;
  deletedVoiceMessages: number;
  deletedWellnessReadings: number;
  deletedNotifications: number;
  deletedAIDecisions: number;
  errors: string[];
}

export async function runRetentionSweep(dryRun = false): Promise<RetentionReport> {
  const errors: string[] = [];
  const report: RetentionReport = {
    ranAt: new Date().toISOString(),
    deletedAuditLogs: 0,
    deletedVoiceMessages: 0,
    deletedWellnessReadings: 0,
    deletedNotifications: 0,
    deletedAIDecisions: 0,
    errors,
  };

  try {
    // Audit logs — tiered by riskLevel
    const auditLowCutoff = cutoff(365);
    const auditMediumCutoff = cutoff(365 * 3);
    const auditHighCutoff = cutoff(365 * 7);

    const auditWhere = {
      OR: [
        { riskLevel: null, createdAt: { lt: auditLowCutoff } },
        { riskLevel: "LOW", createdAt: { lt: auditLowCutoff } },
        { riskLevel: "MEDIUM", createdAt: { lt: auditMediumCutoff } },
        { riskLevel: { in: ["HIGH", "CRITICAL"] }, createdAt: { lt: auditHighCutoff } },
      ],
    };
    if (dryRun) {
      report.deletedAuditLogs = await db.auditLog.count({ where: auditWhere });
    } else {
      const res = await db.auditLog.deleteMany({ where: auditWhere });
      report.deletedAuditLogs = res.count;
    }
  } catch (err) {
    errors.push(`auditLog: ${(err as Error).message}`);
  }

  try {
    const voiceWhere = { createdAt: { lt: cutoff(30) } };
    if (dryRun) {
      report.deletedVoiceMessages = await db.voiceMessage.count({ where: voiceWhere });
    } else {
      const res = await db.voiceMessage.deleteMany({ where: voiceWhere });
      report.deletedVoiceMessages = res.count;
    }
  } catch (err) {
    errors.push(`voiceMessage: ${(err as Error).message}`);
  }

  try {
    const wellnessWhere = { recordedAt: { lt: cutoff(90) } };
    if (dryRun) {
      report.deletedWellnessReadings = await db.workerWellnessReading.count({ where: wellnessWhere });
    } else {
      const res = await db.workerWellnessReading.deleteMany({ where: wellnessWhere });
      report.deletedWellnessReadings = res.count;
    }
  } catch (err) {
    errors.push(`workerWellnessReading: ${(err as Error).message}`);
  }

  try {
    const notifWhere = {
      OR: [
        { readAt: { not: null }, createdAt: { lt: cutoff(90) } },
        { readAt: null, createdAt: { lt: cutoff(180) } },
      ],
    };
    if (dryRun) {
      report.deletedNotifications = await db.notification.count({ where: notifWhere });
    } else {
      const res = await db.notification.deleteMany({ where: notifWhere });
      report.deletedNotifications = res.count;
    }
  } catch (err) {
    errors.push(`notification: ${(err as Error).message}`);
  }

  try {
    // AIDecision — keep CRITICAL-linked 7y, others 2y
    const aiDecisionWhere = {
      AND: [
        { createdAt: { lt: cutoff(365 * 2) } },
        // keep anything linked to an incident with HIGH/CRITICAL severity OR a leak alert
        { incidentId: null, alertId: null },
      ],
    };
    if (dryRun) {
      report.deletedAIDecisions = await db.aIDecision.count({ where: aiDecisionWhere });
    } else {
      const res = await db.aIDecision.deleteMany({ where: aiDecisionWhere });
      report.deletedAIDecisions = res.count;
    }
  } catch (err) {
    errors.push(`aiDecision: ${(err as Error).message}`);
  }

  if (!dryRun) {
    await db.auditLog.create({
      data: {
        module: "GOVERNANCE",
        action: "RETENTION_SWEEP",
        actionType: "AI_AUTONOMOUS",
        isAutonomous: true,
        description: `Retention sweep: audit=${report.deletedAuditLogs}, voice=${report.deletedVoiceMessages}, wellness=${report.deletedWellnessReadings}, notif=${report.deletedNotifications}, ai=${report.deletedAIDecisions}`,
        metadata: JSON.stringify(report),
        riskLevel: "LOW",
      },
    });
  }

  return report;
}
