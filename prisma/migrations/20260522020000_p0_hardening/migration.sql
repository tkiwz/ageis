-- P0 Hardening: AISuggestion + idempotency keys on autonomous writes

CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "proposedAction" TEXT NOT NULL,
    "severity" TEXT,
    "confidence" REAL NOT NULL,
    "reasoning" TEXT,
    "reasoningAr" TEXT,
    "aiAnalysis" TEXT NOT NULL,
    "metadata" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewerNotes" TEXT,
    "resultRefs" TEXT,
    "expiresAt" DATETIME,
    "siteId" TEXT,
    "decisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "AISuggestion_status_createdAt_idx" ON "AISuggestion"("status", "createdAt");
CREATE INDEX "AISuggestion_type_status_idx" ON "AISuggestion"("type", "status");
CREATE INDEX "AISuggestion_siteId_idx" ON "AISuggestion"("siteId");

-- Idempotency keys
ALTER TABLE "LeakAlert" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "LeakAlert_idempotencyKey_key" ON "LeakAlert"("idempotencyKey");

ALTER TABLE "Incident" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Incident_idempotencyKey_key" ON "Incident"("idempotencyKey");
