/**
 * User data export — required by Oman PDPL Article 21 (Right of Access).
 *
 * Returns all personal data tied to a user's identity, in a structured JSON
 * envelope they can download.
 */
import { db } from "@/lib/db";

export interface UserDataExport {
  exportedAt: string;
  user: Record<string, unknown> | null;
  incidents: { reported: unknown[]; assigned: unknown[] };
  permits: { requested: unknown[]; approved: unknown[] };
  observations: unknown[];
  tasks: unknown[];
  voiceMessages: unknown[];
  wellnessReadings: unknown[];
  wellnessAlerts: unknown[];
  notifications: unknown[];
  auditEvents: unknown[];
  trainingRecords: unknown[];
}

export async function exportUserData(userId: string): Promise<UserDataExport> {
  const [
    user,
    incidentsReported,
    incidentsAssigned,
    permitsRequested,
    permitsApproved,
    observations,
    tasks,
    voiceMessages,
    wellnessReadings,
    wellnessAlerts,
    notifications,
    auditEvents,
    enrollments,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, department: true, phone: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    }),
    db.incident.findMany({ where: { reporterId: userId }, take: 500 }),
    db.incident.findMany({ where: { assigneeId: userId }, take: 500 }),
    db.permit.findMany({ where: { requesterId: userId }, take: 500 }),
    db.permit.findMany({ where: { approverId: userId }, take: 500 }),
    db.observation.findMany({ where: { reportedById: userId }, take: 500 }),
    db.task.findMany({ where: { assigneeId: userId }, take: 500 }),
    db.voiceMessage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.workerWellnessReading.findMany({ where: { userId }, orderBy: { recordedAt: "desc" }, take: 500 }),
    db.workerWellnessAlert.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.trainingEnrollment.findMany({ where: { userId }, include: { training: true } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    incidents: { reported: incidentsReported, assigned: incidentsAssigned },
    permits: { requested: permitsRequested, approved: permitsApproved },
    observations,
    tasks,
    voiceMessages,
    wellnessReadings,
    wellnessAlerts,
    notifications,
    auditEvents,
    trainingRecords: enrollments,
  };
}
