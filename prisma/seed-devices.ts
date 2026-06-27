/**
 * Seeds the default Raspberry Pi vision device (Phase 5A.2).
 * Run: npx tsx prisma/seed-devices.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding field devices...");

  // Find Khazzan site to associate with the Pi
  const khazzan = await db.site.findUnique({ where: { code: "KHZ-01" } })
    ?? await db.site.findFirst({ where: { name: { contains: "Khazzan" } } });

  if (!khazzan) {
    console.warn("⚠️  Khazzan site not found — Pi will be unassigned");
  }

  // PI-001: Raspberry Pi at Khazzan (your actual device)
  await db.fieldDevice.upsert({
    where: { code: "PI-001" },
    update: {
      ipAddress: "172.20.10.6",
      port: 5000,
      status: "OFFLINE",  // will go online when first polled
    },
    create: {
      code: "PI-001",
      name: "Camera",
      type: "PI_VISION",
      ipAddress: "172.20.10.6",
      port: 5000,
      status: "OFFLINE",
      modelClasses: ["oil_leak", "mesh_gard", "helmet", "helemt", "no_vest"],
      modelVersion: "v1",
      siteId: khazzan?.id,
    },
  });
  console.log("✅ PI-001 created/updated at 172.20.10.6:5000");

  // Placeholder for ESP32 (not connected yet)
  await db.fieldDevice.upsert({
    where: { code: "ESP-001" },
    update: {},
    create: {
      code: "ESP-001",
      name: "Worker Wearable #1",
      type: "ESP32_WEARABLE",
      ipAddress: null,
      port: null,
      status: "OFFLINE",
      siteId: khazzan?.id,
    },
  });
  console.log("✅ ESP-001 placeholder created");

  console.log("\n🎉 Field devices seeded!");
  const total = await db.fieldDevice.count();
  console.log(`   Total devices: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
