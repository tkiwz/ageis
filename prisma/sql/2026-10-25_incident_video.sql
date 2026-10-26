CREATE TABLE "IncidentVideo" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "operationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "summaryEn" TEXT,
    "summaryAr" TEXT,
    "lessonsEn" TEXT,
    "lessonsAr" TEXT,
    "data" BYTEA,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "IncidentVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IncidentVideo_incidentId_createdAt_idx" ON "IncidentVideo"("incidentId", "createdAt");
ALTER TABLE "IncidentVideo" ADD CONSTRAINT "IncidentVideo_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
