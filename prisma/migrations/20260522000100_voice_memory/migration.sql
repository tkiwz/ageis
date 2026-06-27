-- CreateTable: Voice Conversation Memory (Phase 9 / Feature C)

CREATE TABLE "VoiceMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "transcript" TEXT,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "intent" TEXT,
    "action" TEXT,
    "target" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "VoiceMessage_userId_sessionId_createdAt_idx" ON "VoiceMessage"("userId", "sessionId", "createdAt");
CREATE INDEX "VoiceMessage_sessionId_idx" ON "VoiceMessage"("sessionId");
