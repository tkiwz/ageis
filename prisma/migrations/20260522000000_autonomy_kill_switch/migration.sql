-- CreateTable: Autonomy Kill Switch + Cost Guard infrastructure (Phase 9)

CREATE TABLE "AutonomySettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "globalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pipelineLoopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "forecastEnabled" BOOLEAN NOT NULL DEFAULT true,
    "voiceActionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "permitAutoApproval" BOOLEAN NOT NULL DEFAULT false,
    "visionAutoActions" BOOLEAN NOT NULL DEFAULT true,
    "demoMode" BOOLEAN NOT NULL DEFAULT false,
    "pipelinePollSeconds" INTEGER NOT NULL DEFAULT 30,
    "dailyBudgetUsd" REAL NOT NULL DEFAULT 50.0,
    "monthlyBudgetUsd" REAL NOT NULL DEFAULT 1000.0,
    "maxCallsPerMinute" INTEGER NOT NULL DEFAULT 20,
    "maxCallsPerHour" INTEGER NOT NULL DEFAULT 200,
    "lastModifiedById" TEXT,
    "lastModifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AICostLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "feature" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicroUsd" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "userId" TEXT,
    "autonomous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AICostLedger_module_createdAt_idx" ON "AICostLedger"("module", "createdAt");
CREATE INDEX "AICostLedger_createdAt_idx" ON "AICostLedger"("createdAt");
CREATE INDEX "AICostLedger_provider_model_idx" ON "AICostLedger"("provider", "model");
