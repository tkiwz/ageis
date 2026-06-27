/**
 * AEGIS Pipeline Seed — CLEAN STATE for Live Demo
 * 5 pipelines connecting OQ sites + 25 pressure points + 500 readings
 * NO leak alerts — all points NORMAL — ready for live demo simulation
 *
 * Run: npx tsx prisma/seed-pipelines.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000);
const yearsAgo = (n: number) => new Date(Date.now() - n * 365 * 86400000);

function interpolate(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// ─────────────────────────────────────────────
// PIPELINES (5)
// ─────────────────────────────────────────────

const PIPELINES = [
  {
    id: "pl-001",
    code: "PL-001",
    name: "Khazzan-Sohar Main Gas Export",
    nameAr: "خط تصدير الغاز الرئيسي خزان-صحار",
    length: 285.0,
    diameter: 36,
    material: "STEEL",
    status: "OPERATIONAL",
    productType: "NATURAL_GAS",
    pressureMin: 60,
    pressureMax: 85,
    flowRate: 1250.5,
    startSiteId: "site-khazzan",
    endSiteId: null,
    startLat: 21.4500, startLng: 56.4500,
    endLat: 24.3417, endLng: 56.7080,
    installedAt: yearsAgo(8),
    lastInspection: hoursAgo(720),
    notes: "Main gas export pipeline to Sohar industrial port. Critical national asset.",
  },
  {
    id: "pl-002",
    code: "PL-002",
    name: "Khazzan-Block61 Gas Gathering",
    nameAr: "خط جمع الغاز خزان-بلوك 61",
    length: 45.5,
    diameter: 24,
    material: "STEEL",
    status: "OPERATIONAL",
    productType: "NATURAL_GAS",
    pressureMin: 55,
    pressureMax: 75,
    flowRate: 580.0,
    startSiteId: "site-khazzan",
    endSiteId: "site-block61",
    startLat: 21.4500, startLng: 56.4500,
    endLat: 21.5100, endLng: 56.5400,
    installedAt: yearsAgo(5),
    lastInspection: hoursAgo(360),
    notes: "Inter-field gas gathering line between Khazzan and Block 61.",
  },
  {
    id: "pl-003",
    code: "PL-003",
    name: "Block60-Karim Crude Transfer",
    nameAr: "خط نقل الخام بلوك 60-كريم",
    length: 78.2,
    diameter: 20,
    material: "STEEL",
    status: "OPERATIONAL",
    productType: "CRUDE_OIL",
    pressureMin: 40,
    pressureMax: 65,
    flowRate: 320.0,
    startSiteId: "site-block60",
    endSiteId: "site-karim",
    startLat: 21.3200, startLng: 56.7300,
    endLat: 20.7800, endLng: 56.5100,
    installedAt: yearsAgo(12),
    lastInspection: hoursAgo(1440),
    notes: "Aging crude oil transfer line. Inspection due.",
  },
  {
    id: "pl-004",
    code: "PL-004",
    name: "Block53-Karim Heavy Oil Line",
    nameAr: "خط النفط الثقيل بلوك 53-كريم",
    length: 165.8,
    diameter: 28,
    material: "STEEL",
    status: "OPERATIONAL",
    productType: "CRUDE_OIL",
    pressureMin: 35,
    pressureMax: 60,
    flowRate: 410.0,
    startSiteId: "site-block53",
    endSiteId: "site-karim",
    startLat: 19.4200, startLng: 56.8900,
    endLat: 20.7800, endLng: 56.5100,
    installedAt: yearsAgo(6),
    lastInspection: hoursAgo(168),
    notes: "Heavy oil pipeline with heating stations every 50km.",
  },
  {
    id: "pl-005",
    code: "PL-005",
    name: "Makarem-Musandam LPG Export",
    nameAr: "خط تصدير الغاز المسال المكارم-مسندم",
    length: 420.0,
    diameter: 24,
    material: "STEEL",
    status: "OPERATIONAL",
    productType: "LPG",
    pressureMin: 70,
    pressureMax: 95,
    flowRate: 280.0,
    startSiteId: "site-makarem",
    endSiteId: "site-musandam",
    startLat: 22.6500, startLng: 55.9800,
    endLat: 26.2000, endLng: 56.2500,
    installedAt: yearsAgo(10),
    lastInspection: hoursAgo(72),
    notes: "Long-distance LPG export to Musandam terminal. High-consequence asset.",
  },
];

// ─────────────────────────────────────────────
// HELPERS — Pressure Points generation
// ─────────────────────────────────────────────

function generatePressurePoints(pipeline: typeof PIPELINES[0]) {
  const points = [];
  const numPoints = 5;

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const positionKm = t * pipeline.length;
    const latitude = interpolate(pipeline.startLat, pipeline.endLat, t);
    const longitude = interpolate(pipeline.startLng, pipeline.endLng, t);

    // Pressure decreases along pipeline (normal physics)
    const pressureGradient = pipeline.pressureMax - (t * (pipeline.pressureMax - pipeline.pressureMin) * 0.4);
    // Keep pressure well within safe range (middle of min-max)
    const safeMiddle = (pipeline.pressureMin + pipeline.pressureMax) / 2;
    const currentPressure = safeMiddle + (Math.random() - 0.5) * 4;

    // All points NORMAL for clean demo state
    const status = "NORMAL";

    points.push({
      id: `pp-${pipeline.code.toLowerCase()}-${String(i + 1).padStart(2, "0")}`,
      code: `${pipeline.code}-PP-${String(i + 1).padStart(2, "0")}`,
      pipelineId: pipeline.id,
      latitude,
      longitude,
      positionKm,
      expectedMin: pipeline.pressureMin,
      expectedMax: pipeline.pressureMax,
      currentPressure,
      currentFlow: pipeline.flowRate ? pipeline.flowRate + (Math.random() - 0.5) * 20 : null,
      currentTemp: 25 + Math.random() * 15,
      status,
      lastReadingAt: new Date(),
    });
  }

  return points;
}

// ─────────────────────────────────────────────
// HELPERS — Historical readings (ALL NORMAL)
// ─────────────────────────────────────────────

function generateReadings(point: any, pipeline: typeof PIPELINES[0]) {
  const readings = [];
  const numReadings = 20;

  for (let i = 0; i < numReadings; i++) {
    const hoursBack = (numReadings - i) * 1.2;
    const recordedAt = hoursAgo(hoursBack);

    // All readings are NORMAL — clean state for demo
    const pressure = point.currentPressure + (Math.random() - 0.5) * 2;

    readings.push({
      pointId: point.id,
      pressure,
      flowRate: pipeline.flowRate ? pipeline.flowRate + (Math.random() - 0.5) * 30 : null,
      temperature: 25 + Math.random() * 15,
      status: "NORMAL",
      recordedAt,
    });
  }

  return readings;
}

// ─────────────────────────────────────────────
// LEAK ALERTS — EMPTY for clean demo state
// ─────────────────────────────────────────────

const LEAK_ALERTS: any[] = [];

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding AEGIS Pipeline data (CLEAN STATE)...\n");

  // Clear existing pipeline data
  console.log("🧹 Clearing existing pipeline data...");
  await prisma.leakAlert.deleteMany({});
  await prisma.pressureReading.deleteMany({});
  await prisma.pressurePoint.deleteMany({});
  await prisma.pipeline.deleteMany({});

  // 1. Pipelines
  console.log("\n🛢️  Pipelines:");
  for (const p of PIPELINES) {
    await prisma.pipeline.create({ data: p });
    console.log(`   ✓ ${p.code.padEnd(8)} ${p.name} (${p.length}km, ${p.productType})`);
  }

  // 2. Pressure Points
  console.log("\n📍 Pressure Points (all NORMAL):");
  let totalPoints = 0;
  for (const pipeline of PIPELINES) {
    const points = generatePressurePoints(pipeline);
    for (const point of points) {
      await prisma.pressurePoint.create({ data: point });
    }
    totalPoints += points.length;
    console.log(`   ✓ ${pipeline.code}: ${points.length} pressure points generated`);
  }

  // 3. Pressure Readings (historical — all normal)
  console.log("\n📊 Pressure Readings (historical — all normal):");
  let totalReadings = 0;
  for (const pipeline of PIPELINES) {
    const points = await prisma.pressurePoint.findMany({
      where: { pipelineId: pipeline.id },
    });
    for (const point of points) {
      const readings = generateReadings(point, pipeline);
      for (const reading of readings) {
        await prisma.pressureReading.create({ data: reading });
      }
      totalReadings += readings.length;
    }
  }
  console.log(`   ✓ ${totalReadings} pressure readings generated (last 24 hours)`);

  // 4. Leak Alerts (empty — for live demo)
  console.log("\n🚨 Leak Alerts:");
  console.log(`   ✓ Clean state (0 active leaks) — ready for live demo`);

  console.log("\n📈 Summary:");
  console.log(`   Pipelines:        ${PIPELINES.length}`);
  console.log(`   Pressure Points:  ${totalPoints}`);
  console.log(`   Readings:         ${totalReadings}`);
  console.log(`   Active Leaks:     0 ✨`);
  console.log(`   Status:           CLEAN — ready for live simulation`);

  console.log("\n✅ Pipeline seeding complete!\n");
}

main()
  .catch((e) => {
    console.error("❌ Pipeline seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });