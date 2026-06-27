-- Pilot phase: site-based permissions, worker wellness, in-app notifications

CREATE TABLE "UserSiteAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'READ',
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "shiftStartHour" INTEGER,
    "shiftEndHour" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "UserSiteAccess_userId_siteId_key" ON "UserSiteAccess"("userId", "siteId");
CREATE INDEX "UserSiteAccess_userId_idx" ON "UserSiteAccess"("userId");
CREATE INDEX "UserSiteAccess_siteId_idx" ON "UserSiteAccess"("siteId");

CREATE TABLE "WorkerWellnessReading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "heartRate" INTEGER,
    "hrVariability" REAL,
    "bodyTemperature" REAL,
    "ambientTemp" REAL,
    "humidity" REAL,
    "h2sExposurePpmMin" REAL NOT NULL DEFAULT 0,
    "coExposurePpmMin" REAL NOT NULL DEFAULT 0,
    "o2Level" REAL,
    "stepsCount" INTEGER NOT NULL DEFAULT 0,
    "fallDetected" BOOLEAN NOT NULL DEFAULT false,
    "wellnessLevel" TEXT NOT NULL DEFAULT 'LOW',
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkerWellnessReading_userId_recordedAt_idx" ON "WorkerWellnessReading"("userId", "recordedAt");
CREATE INDEX "WorkerWellnessReading_wellnessLevel_recordedAt_idx" ON "WorkerWellnessReading"("wellnessLevel", "recordedAt");

CREATE TABLE "WorkerWellnessAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "message" TEXT NOT NULL,
    "messageAr" TEXT,
    "aiReasoning" TEXT,
    "recommendedAction" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkerWellnessAlert_userId_createdAt_idx" ON "WorkerWellnessAlert"("userId", "createdAt");
CREATE INDEX "WorkerWellnessAlert_severity_acknowledged_idx" ON "WorkerWellnessAlert"("severity", "acknowledged");

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "body" TEXT NOT NULL,
    "bodyAr" TEXT,
    "link" TEXT,
    "metadata" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");
