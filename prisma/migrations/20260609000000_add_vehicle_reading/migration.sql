-- CreateTable
CREATE TABLE IF NOT EXISTS "VehicleReading" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "deviceCode"   TEXT NOT NULL DEFAULT 'VEH-001',
    "siteCode"     TEXT,
    "eventType"    TEXT NOT NULL DEFAULT 'NORMAL',
    "gasVal"       INTEGER NOT NULL DEFAULT 0,
    "temperature"  REAL NOT NULL DEFAULT 0,
    "pressure"     REAL NOT NULL DEFAULT 0,
    "acceleration" REAL NOT NULL DEFAULT 0,
    "voltage"      REAL NOT NULL DEFAULT 0,
    "currentMa"    REAL NOT NULL DEFAULT 0,
    "powerMw"      REAL NOT NULL DEFAULT 0,
    "uptimeS"      INTEGER NOT NULL DEFAULT 0,
    "recordedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VehicleReading_deviceCode_recordedAt_idx" ON "VehicleReading"("deviceCode", "recordedAt");

-- CreateIndex  
CREATE INDEX IF NOT EXISTS "VehicleReading_eventType_recordedAt_idx" ON "VehicleReading"("eventType", "recordedAt");
