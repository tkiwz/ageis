-- AEGIS Brain Core: Memory + Session + AgentRun

CREATE TABLE "BrainMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "contentAr" TEXT,
    "evidence" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "reinforcements" INTEGER NOT NULL DEFAULT 0,
    "contradictions" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "embedding" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" DATETIME,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "BrainMemory_category_status_idx" ON "BrainMemory"("category", "status");
CREATE INDEX "BrainMemory_subject_idx" ON "BrainMemory"("subject");
CREATE INDEX "BrainMemory_confidence_idx" ON "BrainMemory"("confidence");

CREATE TABLE "BrainSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "signalType" TEXT,
    "signalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'THINKING',
    "context" TEXT NOT NULL,
    "agentsConsulted" TEXT,
    "conclusion" TEXT,
    "conclusionAr" TEXT,
    "confidence" REAL,
    "actionsRecommended" TEXT,
    "actionsTaken" TEXT,
    "recalledMemoryIds" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "userId" TEXT,
    "siteId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostMicroUsd" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "BrainSession_trigger_startedAt_idx" ON "BrainSession"("trigger", "startedAt");
CREATE INDEX "BrainSession_status_startedAt_idx" ON "BrainSession"("status", "startedAt");
CREATE INDEX "BrainSession_signalId_idx" ON "BrainSession"("signalId");
CREATE INDEX "BrainSession_siteId_startedAt_idx" ON "BrainSession"("siteId", "startedAt");

CREATE TABLE "BrainAgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "confidence" REAL,
    "durationMs" INTEGER,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "memoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrainAgentRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrainSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BrainAgentRun_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "BrainMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BrainAgentRun_sessionId_idx" ON "BrainAgentRun"("sessionId");
CREATE INDEX "BrainAgentRun_agentName_idx" ON "BrainAgentRun"("agentName");
