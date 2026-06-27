-- Knowledge contributions — users teach the brain

CREATE TABLE "KnowledgeContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "structuredContent" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contextType" TEXT,
    "contextId" TEXT,
    "contributorId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewerNotes" TEXT,
    "resultingMemoryIds" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "transcript" TEXT,
    "language" TEXT,
    "autoEscalatedTo" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "KnowledgeContribution_status_createdAt_idx" ON "KnowledgeContribution"("status", "createdAt");
CREATE INDEX "KnowledgeContribution_source_status_idx" ON "KnowledgeContribution"("source", "status");
CREATE INDEX "KnowledgeContribution_contributorId_idx" ON "KnowledgeContribution"("contributorId");
CREATE INDEX "KnowledgeContribution_severity_status_idx" ON "KnowledgeContribution"("severity", "status");

CREATE TABLE "KnowledgeReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contributionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeReview_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "KnowledgeContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "KnowledgeReview_contributionId_idx" ON "KnowledgeReview"("contributionId");

CREATE TABLE "MemoryConflict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newContributionId" TEXT NOT NULL,
    "existingMemoryId" TEXT NOT NULL,
    "similarity" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MemoryConflict_newContributionId_idx" ON "MemoryConflict"("newContributionId");
CREATE INDEX "MemoryConflict_resolution_createdAt_idx" ON "MemoryConflict"("resolution", "createdAt");

CREATE TABLE "ExpertProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "contributionsCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "trustWeight" REAL NOT NULL DEFAULT 0.5,
    "specialties" TEXT,
    "lastActiveAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ExpertProfile_userId_key" ON "ExpertProfile"("userId");
CREATE INDEX "ExpertProfile_trustWeight_idx" ON "ExpertProfile"("trustWeight");
