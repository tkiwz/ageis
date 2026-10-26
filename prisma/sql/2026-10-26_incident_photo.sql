CREATE TABLE "IncidentPhoto" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IncidentPhoto_incidentId_idx" ON "IncidentPhoto"("incidentId");
ALTER TABLE "IncidentPhoto" ADD CONSTRAINT "IncidentPhoto_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
