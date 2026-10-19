-- 2026-10-19: FK indexes (Supabase advisor) + RLS on all public tables (ADR-002).
-- Applied via Supabase MCP. Prisma connects as postgres (BYPASSRLS, table owner).

CREATE INDEX IF NOT EXISTS "Alert_siteId_idx" ON "Alert"("siteId");
CREATE INDEX IF NOT EXISTS "AuditLog_siteId_idx" ON "AuditLog"("siteId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AutonomousAction_ruleId_idx" ON "AutonomousAction"("ruleId");
CREATE INDEX IF NOT EXISTS "BrainAgentRun_memoryId_idx" ON "BrainAgentRun"("memoryId");
CREATE INDEX IF NOT EXISTS "ComplianceItem_responsibleId_idx" ON "ComplianceItem"("responsibleId");
CREATE INDEX IF NOT EXISTS "ComplianceItem_siteId_idx" ON "ComplianceItem"("siteId");
CREATE INDEX IF NOT EXISTS "Document_siteId_idx" ON "Document"("siteId");
CREATE INDEX IF NOT EXISTS "Document_uploadedById_idx" ON "Document"("uploadedById");
CREATE INDEX IF NOT EXISTS "EmergencyEvent_commandedById_idx" ON "EmergencyEvent"("commandedById");
CREATE INDEX IF NOT EXISTS "EmergencyEvent_siteId_idx" ON "EmergencyEvent"("siteId");
CREATE INDEX IF NOT EXISTS "Incident_assigneeId_idx" ON "Incident"("assigneeId");
CREATE INDEX IF NOT EXISTS "Incident_reporterId_idx" ON "Incident"("reporterId");
CREATE INDEX IF NOT EXISTS "Incident_siteId_idx" ON "Incident"("siteId");
CREATE INDEX IF NOT EXISTS "IncidentAction_incidentId_idx" ON "IncidentAction"("incidentId");
CREATE INDEX IF NOT EXISTS "Inspection_conductedById_idx" ON "Inspection"("conductedById");
CREATE INDEX IF NOT EXISTS "Inspection_siteId_idx" ON "Inspection"("siteId");
CREATE INDEX IF NOT EXISTS "Investigation_leadInvestigatorId_idx" ON "Investigation"("leadInvestigatorId");
CREATE INDEX IF NOT EXISTS "IoTDevice_siteId_idx" ON "IoTDevice"("siteId");
CREATE INDEX IF NOT EXISTS "LeakAlert_pipelineId_idx" ON "LeakAlert"("pipelineId");
CREATE INDEX IF NOT EXISTS "Observation_reportedById_idx" ON "Observation"("reportedById");
CREATE INDEX IF NOT EXISTS "Observation_siteId_idx" ON "Observation"("siteId");
CREATE INDEX IF NOT EXISTS "Permit_approverId_idx" ON "Permit"("approverId");
CREATE INDEX IF NOT EXISTS "Permit_requesterId_idx" ON "Permit"("requesterId");
CREATE INDEX IF NOT EXISTS "Permit_siteId_idx" ON "Permit"("siteId");
CREATE INDEX IF NOT EXISTS "PermitCondition_permitId_idx" ON "PermitCondition"("permitId");
CREATE INDEX IF NOT EXISTS "PressurePoint_pipelineId_idx" ON "PressurePoint"("pipelineId");
CREATE INDEX IF NOT EXISTS "RiskAssessment_conductedById_idx" ON "RiskAssessment"("conductedById");
CREATE INDEX IF NOT EXISTS "RiskAssessment_permitId_idx" ON "RiskAssessment"("permitId");
CREATE INDEX IF NOT EXISTS "RiskAssessment_siteId_idx" ON "RiskAssessment"("siteId");
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_siteId_idx" ON "Task"("siteId");
CREATE INDEX IF NOT EXISTS "TrainingEnrollment_userId_idx" ON "TrainingEnrollment"("userId");

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
