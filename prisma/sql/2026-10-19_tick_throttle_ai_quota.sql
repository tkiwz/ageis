-- 2026-10-19: global pipeline tick throttle + per-user AI quota index (ADR-003). Applied via Supabase MCP.
ALTER TABLE "AutonomySettings" ADD COLUMN IF NOT EXISTS "lastPipelineTickAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AICostLedger_userId_module_feature_createdAt_idx" ON "AICostLedger"("userId", "module", "feature", "createdAt");
