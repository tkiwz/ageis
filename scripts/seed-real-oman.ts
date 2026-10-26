/**
 * Replaces the demo data with real Oman oil & gas facilities.
 *
 *   npx tsx scripts/seed-real-oman.ts            # dry run: shows what would change
 *   npx tsx scripts/seed-real-oman.ts --apply    # backup → delete demo → load real data
 *
 * - Locations: OpenStreetMap (mapped from satellite imagery); specs: Global Energy Monitor.
 *   See docs/REAL-DATA-PLAN.md for every figure and its source.
 * - Pipeline routes are approximate (real endpoints, real towns in between).
 * - Pressure / flow / temperature are SIMULATED (pipelines flagged isSimulated);
 *   7 days of history are generated, then the app keeps them current.
 * - Kept: users, audit log, AI cost ledger, login history, autonomy settings, rules.
 * - Before deleting, every removed table is written to backups/demo-data-<time>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { SIM_STEP_MS, simPointFromRow, simulateReading } from "@/lib/simulation/pipeline-sim";

const APPLY = process.argv.includes("--apply");
const OSM = "OpenStreetMap (© OSM contributors, ODbL)";
const GEM = "Global Energy Monitor (gem.wiki, CC BY-SA)";

// ── Facilities ─────────────────────────────────────────────
type SiteSeed = {
  id: string; code: string; name: string; nameAr: string; productionType: string; riskLevel: string;
  operator: string; lat: number; lng: number; source: string; description: string;
};
const SITES: SiteSeed[] = [
  { id: "om-khazzan", code: "KHZ-CPF", name: "Khazzan Central Processing Facility (Block 61)", nameAr: "منشأة المعالجة المركزية بخزان (المربع 61)", productionType: "GAS", riskLevel: "MEDIUM", operator: "BP", lat: 21.6611, lng: 56.4107, source: OSM, description: "Tight-gas processing for the Khazzan and Ghazeer fields." },
  { id: "om-saih-rawl", code: "SRL-GAS", name: "Saih Rawl Gas Complex", nameAr: "مجمع غاز سيح الرول", productionType: "GAS", riskLevel: "MEDIUM", operator: "PDO", lat: 21.3601, lng: 56.7319, source: OSM, description: "Central gas processing; start of the Saih Rawl–Sur line to Oman LNG." },
  { id: "om-qarn-alam", code: "QAL-001", name: "Qarn Alam", nameAr: "قرن العلم", productionType: "OIL", riskLevel: "MEDIUM", operator: "PDO", lat: 21.2958, lng: 57.0985, source: OSM, description: "Oil production hub (Qarn Alam cluster, thermal EOR)." },
  { id: "om-fahud", code: "FHD-001", name: "Fahud", nameAr: "فهود", productionType: "OIL_AND_GAS", riskLevel: "MEDIUM", operator: "PDO", lat: 22.3205, lng: 56.4361, source: GEM, description: "Block 6 oil field and gas compressor hub; start of the Fahud–Sohar gas lines." },
  { id: "om-yibal", code: "YBL-001", name: "Yibal", nameAr: "يبال", productionType: "OIL_AND_GAS", riskLevel: "MEDIUM", operator: "PDO", lat: 22.2015, lng: 56.0344, source: `${OSM} — airfield, approximate`, description: "Oil and gas field (Yibal Khuff)." },
  { id: "om-lekhwair", code: "LKW-001", name: "Lekhwair", nameAr: "لخوير", productionType: "OIL", riskLevel: "LOW", operator: "PDO", lat: 22.8423, lng: 55.4021, source: OSM, description: "Oil field in north-west Oman." },
  { id: "om-safah", code: "SFH-GAS", name: "Safah Gas Plant (Block 9)", nameAr: "محطة غاز صفاح (المربع 9)", productionType: "GAS", riskLevel: "MEDIUM", operator: "Occidental", lat: 23.1905, lng: 55.4601, source: OSM, description: "Gas processing plant in Block 9." },
  { id: "om-mukhaizna", code: "MKZ-001", name: "Mukhaizna Field (Block 53)", nameAr: "حقل مخيزنة (المربع 53)", productionType: "HEAVY_OIL", riskLevel: "MEDIUM", operator: "Occidental", lat: 19.3384, lng: 56.4794, source: OSM, description: "Heavy-oil field produced with steam flood." },
  { id: "om-mabrouk", code: "MBR-001", name: "Mabrouk", nameAr: "مبروك", productionType: "GAS", riskLevel: "LOW", operator: "PDO", lat: 21.2449, lng: 56.3465, source: OSM, description: "Gas field in central Oman." },
  { id: "om-nimr", code: "NMR-001", name: "Nimr", nameAr: "نمر", productionType: "OIL", riskLevel: "LOW", operator: "PDO", lat: 18.5564, lng: 55.8617, source: OSM, description: "Oil field in south Oman." },
  { id: "om-amal", code: "AML-001", name: "Amal", nameAr: "أمل", productionType: "HEAVY_OIL", riskLevel: "LOW", operator: "PDO", lat: 18.3335, lng: 55.686, source: OSM, description: "Heavy-oil field in south Oman." },
  { id: "om-marmul", code: "MRM-001", name: "Marmul", nameAr: "مرمول", productionType: "OIL", riskLevel: "LOW", operator: "PDO", lat: 18.1395, lng: 55.1754, source: `${OSM} — airfield, approximate`, description: "Oil field in Dhofar." },
  { id: "om-oman-lng", code: "OLNG-QLT", name: "Oman LNG, Qalhat (Sur)", nameAr: "العُمانية للغاز الطبيعي المسال – قلهات (صور)", productionType: "GAS", riskLevel: "HIGH", operator: "Oman LNG", lat: 22.6599, lng: 59.4063, source: OSM, description: "LNG liquefaction and export terminal." },
  { id: "om-duqm", code: "DQM-REF", name: "Duqm Refinery", nameAr: "مصفاة الدقم", productionType: "REFINERY", riskLevel: "HIGH", operator: "OQ8", lat: 19.7323, lng: 57.6591, source: `${OSM}; capacity: Climate TRACE`, description: "Refinery, about 230,000 barrels per day." },
  { id: "om-sohar", code: "SHR-REF", name: "Sohar Refinery & Port", nameAr: "مصفاة صحار وميناؤها", productionType: "REFINERY", riskLevel: "HIGH", operator: "OQ", lat: 24.4913, lng: 56.6151, source: `${OSM} — port, approximate`, description: "Refinery and petrochemicals at Sohar industrial port; end of the Fahud–Sohar gas lines." },
  { id: "om-mina-al-fahal", code: "MAF-001", name: "Mina Al Fahal", nameAr: "ميناء الفحل", productionType: "REFINERY", riskLevel: "HIGH", operator: "OQ", lat: 23.6231, lng: 58.5182, source: `${OSM} — area`, description: "Refinery and crude-oil export terminal near Muscat." },
];

// ── Pipelines (OQ Gas Networks) ─────────────────────────────
type LineSeed = {
  id: string; code: string; name: string; nameAr: string; lengthKm: number; diameter: number;
  installed: string; startSite: string; endSite: string;
  route: [number, number][];            // lat, lng — real endpoints, approximate middle
  inlet: number; outlet: number;        // nominal bar at start / end
  flow: number;                         // nominal m³/h
  points: number;
  notes: string;
};
const LINES: LineSeed[] = [
  {
    id: "om-gas-srs", code: "GAS-SRS-48", name: "Saih Rawl – Sur Gas Pipeline (Oman LNG)", nameAr: "خط غاز سيح الرول – صور (العُمانية للغاز المسال)",
    lengthKm: 360, diameter: 48, installed: "2000-01-01", startSite: "om-saih-rawl", endSite: "om-oman-lng",
    route: [[21.3601, 56.7319], [21.80, 57.65], [22.20, 58.55], [22.3905, 59.0699], [22.6599, 59.4063]],
    inlet: 88, outlet: 72, flow: 1_370_000, points: 8,
    notes: "OQGN line, 48 in, 360 km, operating since 2000, ~12 bcm/y (GEM). Route between endpoints is approximate (via Al Kamil).",
  },
  {
    id: "om-gas-fhs", code: "GAS-FHS-32", name: "Fahud – Sohar Gas Pipeline (main line)", nameAr: "خط غاز فهود – صحار (الخط الرئيسي)",
    lengthKm: 300, diameter: 32, installed: "2004-01-01", startSite: "om-fahud", endSite: "om-sohar",
    route: [[22.3205, 56.4361], [22.80, 56.47], [23.23, 56.50], [23.85, 56.55], [24.4913, 56.6151]],
    inlet: 82, outlet: 64, flow: 1_150_000, points: 7,
    notes: "OQGN line, 32 in, 300 km, operating since 2004 (GEM). A parallel 32 in line (2020) runs alongside. Route between endpoints is approximate (via Ibri).",
  },
];

// ── helpers ─────────────────────────────────────────────────
const R = 6371;
function haversine(a: [number, number], b: [number, number]) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
/** Point at fraction f (0..1) along the polyline. */
function along(route: [number, number][], f: number): [number, number] {
  const seg = route.slice(1).map((p, i) => haversine(route[i], p));
  const total = seg.reduce((s, v) => s + v, 0);
  let d = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return [route[i][0] + (route[i + 1][0] - route[i][0]) * t, route[i][1] + (route[i + 1][1] - route[i][1]) * t];
    }
    d -= seg[i];
  }
  return route[route.length - 1];
}

// Demo tables, children first. Kept: User, AuditLog, AICostLedger, LoginAttempt, AccountLockout, AutonomySettings, Rule, Session.
const DEMO_TABLES = [
  "investigation", "incident", "riskAssessment", "permit", "complianceItem", "inspection", "observation", "task",
  "documentAcknowledgment", "document", "emergencyEvent", "alert", "notification",
  "sensorReading", "ioTDevice", "deviceTelemetry", "fieldDevice", "visionDetection", "vehicleReading",
  "weatherReading", "emissionReading", "workerWellnessAlert", "workerWellnessReading",
  "aISuggestion", "aIInsight", "aIDecision", "autonomousAction", "brainAgentRun", "brainSession",
  "memoryConflict", "brainMemory", "knowledgeReview", "knowledgeContribution", "voiceMessage",
  "trainingEnrollment", "training", "pipeline", "userSiteAccess", "site",
] as const;

type Delegate = { count: () => Promise<number>; findMany: () => Promise<unknown[]>; deleteMany: () => Promise<{ count: number }> };
const table = (name: string) => (db as unknown as Record<string, Delegate>)[name];

async function main() {
  console.log(APPLY ? "APPLY — this changes the database" : "DRY RUN — nothing is changed (add --apply)");

  const counts: Record<string, number> = {};
  for (const name of DEMO_TABLES) {
    const t = table(name);
    if (!t) { console.warn(`  (skip unknown table ${name})`); continue; }
    counts[name] = await t.count();
  }
  console.log("Demo rows to remove:", Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)));
  console.log(`Real data to load: ${SITES.length} sites, ${LINES.length} pipelines, ${LINES.reduce((s, l) => s + l.points, 0)} pressure points, 7 days of simulated readings`);
  if (!APPLY) return;

  // 1. Backup everything that will be removed
  mkdirSync("backups", { recursive: true });
  const backup: Record<string, unknown[]> = {};
  for (const name of DEMO_TABLES) {
    const t = table(name);
    if (t && counts[name]) backup[name] = await t.findMany();
  }
  backup.pressurePoint = await db.pressurePoint.findMany();
  backup.pressureReading = await db.pressureReading.findMany();
  backup.leakAlert = await db.leakAlert.findMany();
  const file = `backups/demo-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(backup, (_k, v) => (v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString("base64") } : v)));
  console.log(`Backup written: ${file}`);

  // 2. Remove demo data (children first)
  for (const name of DEMO_TABLES) {
    const t = table(name);
    if (!t || !counts[name]) continue;
    const r = await t.deleteMany();
    console.log(`  deleted ${r.count} ${name}`);
  }

  // 3. Real facilities
  for (const s of SITES) {
    await db.site.create({
      data: {
        id: s.id, code: s.code, name: s.name, nameAr: s.nameAr, description: s.description,
        productionType: s.productionType, riskLevel: s.riskLevel, status: "ACTIVE",
        latitude: s.lat, longitude: s.lng, operator: s.operator, source: s.source,
      },
    });
  }
  console.log(`  created ${SITES.length} sites`);

  // 4. Pipelines, pressure points (block-valve stations), 7 days of simulated readings
  const now = Date.now();
  const from = Math.floor((now - 7 * 24 * 3600_000) / SIM_STEP_MS) * SIM_STEP_MS;
  for (const l of LINES) {
    const start = SITES.find((s) => s.id === l.startSite)!, end = SITES.find((s) => s.id === l.endSite)!;
    await db.pipeline.create({
      data: {
        id: l.id, code: l.code, name: l.name, nameAr: l.nameAr, length: l.lengthKm, diameter: l.diameter,
        material: "STEEL", status: "OPERATIONAL", productType: "NATURAL_GAS",
        pressureMin: Math.round(l.outlet - 14), pressureMax: Math.round(l.inlet + 10), flowRate: l.flow,
        startSiteId: start.id, endSiteId: end.id,
        startLat: start.lat, startLng: start.lng, endLat: end.lat, endLng: end.lng,
        midPoints: JSON.stringify(l.route.slice(1, -1)),
        installedAt: new Date(l.installed),
        notes: l.notes, operator: "OQ Gas Networks", source: GEM, isSimulated: true,
      },
    });

    for (let i = 0; i < l.points; i++) {
      const f = i / (l.points - 1);
      const [lat, lng] = along(l.route, f);
      const km = Math.round(f * l.lengthKm * 10) / 10;
      const nominal = l.inlet + (l.outlet - l.inlet) * f;      // pressure falls along the line
      const expectedMin = Math.round((nominal - 10) * 10) / 10;
      const expectedMax = Math.round((nominal + 6.7) * 10) / 10; // nominal = 60% up the band
      const code = `${l.code.split("-").slice(0, 2).join("-")}-BV${String(i + 1).padStart(2, "0")}`;
      const pt = await db.pressurePoint.create({
        data: { code, pipelineId: l.id, latitude: lat, longitude: lng, positionKm: km, expectedMin, expectedMax },
      });
      const sim = simPointFromRow({ code, expectedMin, expectedMax, positionKm: km }, { length: l.lengthKm, pressureMax: l.inlet + 10, flowRate: l.flow }, i);
      const rows = [];
      for (let t = from; t <= now; t += SIM_STEP_MS) rows.push({ pointId: pt.id, recordedAt: new Date(t), ...simulateReading(sim, t) });
      for (let k = 0; k < rows.length; k += 500) await db.pressureReading.createMany({ data: rows.slice(k, k + 500) });
      const last = rows[rows.length - 1];
      await db.pressurePoint.update({
        where: { id: pt.id },
        data: { currentPressure: last.pressure, currentFlow: last.flowRate, currentTemp: last.temperature, status: last.status, lastReadingAt: last.recordedAt },
      });
    }
    console.log(`  created ${l.code} with ${l.points} points`);
  }

  await appendAuditLog({
    module: "ADMIN",
    action: "REAL_DATA_LOADED",
    description: `Demo data removed (backup ${file}); loaded ${SITES.length} real Oman facilities and ${LINES.length} OQGN gas pipelines (simulated readings)`,
    metadata: JSON.stringify({ removed: counts, sources: [OSM, GEM] }),
    riskLevel: "HIGH",
  });
  console.log("Done.");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); }).finally(() => db.$disconnect());
