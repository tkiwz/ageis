/**
 * AEGIS Seed — Phase 4.1
 * Complete dataset: users + 9 Omani sites + IoT + incidents + permits + alerts + rules
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "102030";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

// ─────────────────────────────────────────────
// 1. USERS (5)
// ─────────────────────────────────────────────

const USERS = [
  { id: "user-admin-001",      email: "admin@aegis.local",      name: "System Admin",    role: "ADMIN",          department: "IT" },
  { id: "user-manager-001",    email: "manager@aegis.local",    name: "Ahmed Al-Rashid", role: "HSSE_MANAGER",   department: "HSSE" },
  { id: "user-officer-001",    email: "officer@aegis.local",    name: "Sara Al-Mansour", role: "SAFETY_OFFICER", department: "Safety" },
  { id: "user-supervisor-001", email: "supervisor@aegis.local", name: "Khalid Al-Said",  role: "SUPERVISOR",     department: "Operations" },
  { id: "user-operator-001",   email: "operator@aegis.local",   name: "Yusuf Al-Habsi",  role: "OPERATOR",       department: "Field" },
];

// ─────────────────────────────────────────────
// 2. SITES (9 Omani oil & gas fields)
// ─────────────────────────────────────────────

const SITES = [
  { id: "site-khazzan",  code: "KHZ-001",  name: "Khazzan Gas Field",          nameAr: "حقل خزان للغاز",     productionType: "GAS",         riskLevel: "MEDIUM",   status: "ACTIVE", latitude: 21.4500, longitude: 56.4500, capacity: 450, currentOccupancy: 312, description: "Major tight-gas field in central Oman, producing >1 BCF/day." },
  { id: "site-makarem",  code: "MKM-001",  name: "Makarem Sour Gas Plant",     nameAr: "محطة المكارم للغاز",   productionType: "GAS",         riskLevel: "HIGH",     status: "ACTIVE", latitude: 22.6500, longitude: 55.9800, capacity: 280, currentOccupancy: 205, description: "Sour gas processing facility with H2S handling." },
  { id: "site-block60",  code: "BL60-001", name: "Block 60",                   nameAr: "بلوك 60",             productionType: "OIL_AND_GAS", riskLevel: "MEDIUM",   status: "ACTIVE", latitude: 21.3200, longitude: 56.7300, capacity: 200, currentOccupancy: 178, description: "Oil and condensate production block in central Oman." },
  { id: "site-block61",  code: "BL61-001", name: "Block 61 / Khazzan-Ghazeer", nameAr: "بلوك 61",             productionType: "GAS",         riskLevel: "MEDIUM",   status: "ACTIVE", latitude: 21.5100, longitude: 56.5400, capacity: 380, currentOccupancy: 290, description: "Tight gas development phase 2." },
  { id: "site-block65",  code: "BL65-001", name: "Block 65",                   nameAr: "بلوك 65",             productionType: "OIL",         riskLevel: "LOW",      status: "ACTIVE", latitude: 19.6800, longitude: 56.2400, capacity: 120, currentOccupancy: 88,  description: "Conventional oil field in south Oman." },
  { id: "site-block53",  code: "BL53-001", name: "Block 53 / Mukhaizna",       nameAr: "بلوك 53 / مخيزنة",     productionType: "HEAVY_OIL",   riskLevel: "HIGH",     status: "ACTIVE", latitude: 19.4200, longitude: 56.8900, capacity: 350, currentOccupancy: 298, description: "Heavy oil field with steam injection (EOR)." },
  { id: "site-karim",    code: "KRM-001",  name: "Karim Cluster",              nameAr: "حقل كريم",           productionType: "OIL",         riskLevel: "LOW",      status: "ACTIVE", latitude: 20.7800, longitude: 56.5100, capacity: 90,  currentOccupancy: 62,  description: "Mature oil cluster with multiple satellite wells." },
  { id: "site-rima",     code: "RMA-001",  name: "Rima Cluster",               nameAr: "حقل ريما",           productionType: "OIL",         riskLevel: "LOW",      status: "ACTIVE", latitude: 19.9300, longitude: 55.7800, capacity: 80,  currentOccupancy: 54,  description: "Light oil production cluster." },
  { id: "site-musandam", code: "MSD-001",  name: "Musandam LPG Terminal",      nameAr: "محطة مسندم للغاز",   productionType: "GAS",         riskLevel: "CRITICAL", status: "ACTIVE", latitude: 26.2000, longitude: 56.2500, capacity: 150, currentOccupancy: 120, description: "LPG export terminal — high consequence facility." },
];

// ─────────────────────────────────────────────
// 3. IoT DEVICES (24 sensors)
// ─────────────────────────────────────────────

const DEVICES = [
  { id: "dev-khz-h2s-01",   code: "KHZ-H2S-01",   name: "H2S Detector Zone A",      type: "H2S_DETECTOR", unit: "ppm",    warningHigh: 10, criticalHigh: 100, status: "ONLINE",      siteId: "site-khazzan",  location: "Process Zone A" },
  { id: "dev-khz-temp-01",  code: "KHZ-TEMP-01",  name: "Temperature - Compressor", type: "TEMPERATURE",  unit: "°C",     warningHigh: 60, criticalHigh: 80,  status: "ONLINE",      siteId: "site-khazzan",  location: "Compressor Station" },
  { id: "dev-khz-press-01", code: "KHZ-PRS-01",   name: "Pressure - Main Line",     type: "PRESSURE",     unit: "bar",    warningHigh: 8,  criticalHigh: 10,  status: "ONLINE",      siteId: "site-khazzan",  location: "Main Pipeline" },
  { id: "dev-mkm-h2s-01",   code: "MKM-H2S-01",   name: "H2S Detector Wellhead",    type: "H2S_DETECTOR", unit: "ppm",    warningHigh: 10, criticalHigh: 100, status: "ONLINE",      siteId: "site-makarem",  location: "Wellhead B-12" },
  { id: "dev-mkm-h2s-02",   code: "MKM-H2S-02",   name: "H2S Detector Plant",       type: "H2S_DETECTOR", unit: "ppm",    warningHigh: 10, criticalHigh: 100, status: "ONLINE",      siteId: "site-makarem",  location: "Processing Plant" },
  { id: "dev-mkm-lel-01",   code: "MKM-LEL-01",   name: "Gas LEL Detector",         type: "GAS_LEL",      unit: "%",      warningHigh: 10, criticalHigh: 20,  status: "ONLINE",      siteId: "site-makarem",  location: "Loading Bay" },
  { id: "dev-mkm-temp-01",  code: "MKM-TEMP-01",  name: "Temperature - Reactor",    type: "TEMPERATURE",  unit: "°C",     warningHigh: 60, criticalHigh: 80,  status: "ONLINE",      siteId: "site-makarem",  location: "Reactor R-1" },
  { id: "dev-bl60-fire-01", code: "BL60-FIRE-01", name: "Fire Alarm - Tank Farm",   type: "FIRE_ALARM",   unit: "status",                                     status: "ONLINE",      siteId: "site-block60",  location: "Tank Farm" },
  { id: "dev-bl60-cam-01",  code: "BL60-CAM-01",  name: "PPE Camera - Gate",        type: "CAMERA",       unit: "status",                                     status: "ONLINE",      siteId: "site-block60",  location: "Main Gate" },
  { id: "dev-bl60-wind-01", code: "BL60-WIND-01", name: "Wind Speed Sensor",        type: "WIND",         unit: "km/h",   warningHigh: 40, criticalHigh: 60,  status: "ONLINE",      siteId: "site-block60",  location: "Met Tower" },
  { id: "dev-bl61-h2s-01",  code: "BL61-H2S-01",  name: "H2S Detector",             type: "H2S_DETECTOR", unit: "ppm",    warningHigh: 10, criticalHigh: 100, status: "ONLINE",      siteId: "site-block61",  location: "Wellsite W-5" },
  { id: "dev-bl61-temp-01", code: "BL61-TEMP-01", name: "Temperature - Pipeline",   type: "TEMPERATURE",  unit: "°C",     warningHigh: 60, criticalHigh: 80,  status: "ONLINE",      siteId: "site-block61",  location: "Export Pipeline" },
  { id: "dev-bl61-press-01",code: "BL61-PRS-01",  name: "Pressure - Wellhead",      type: "PRESSURE",     unit: "bar",    warningHigh: 8,  criticalHigh: 10,  status: "MAINTENANCE", siteId: "site-block61",  location: "Wellsite W-5" },
  { id: "dev-bl65-aqi-01",  code: "BL65-AQI-01",  name: "Air Quality Monitor",      type: "AQI",          unit: "AQI",    warningHigh: 100,criticalHigh: 200, status: "ONLINE",      siteId: "site-block65",  location: "Process Area" },
  { id: "dev-bl65-noise-01",code: "BL65-NOISE-01",name: "Noise Monitor",            type: "NOISE",        unit: "dB",     warningHigh: 85, criticalHigh: 130, status: "ONLINE",      siteId: "site-block65",  location: "Compressor" },
  { id: "dev-bl53-temp-01", code: "BL53-TEMP-01", name: "Steam Injection Temp",     type: "TEMPERATURE",  unit: "°C",     warningHigh: 60, criticalHigh: 80,  status: "ONLINE",      siteId: "site-block53",  location: "Steam Plant" },
  { id: "dev-bl53-press-01",code: "BL53-PRS-01",  name: "Steam Pressure",           type: "PRESSURE",     unit: "bar",    warningHigh: 8,  criticalHigh: 10,  status: "ONLINE",      siteId: "site-block53",  location: "Steam Plant" },
  { id: "dev-bl53-vib-01",  code: "BL53-VIB-01",  name: "Pump Vibration",           type: "VIBRATION",    unit: "mm/s",   warningHigh: 30, criticalHigh: 50,  status: "ONLINE",      siteId: "site-block53",  location: "Pump Station P-3" },
  { id: "dev-krm-oxy-01",   code: "KRM-OXY-01",   name: "Oxygen - Confined Space",  type: "OXYGEN",       unit: "%",      warningLow: 19, criticalLow: 16, warningHigh: 23, criticalHigh: 25, status: "ONLINE", siteId: "site-karim", location: "Tank T-1" },
  { id: "dev-krm-h2s-01",   code: "KRM-H2S-01",   name: "H2S Detector",             type: "H2S_DETECTOR", unit: "ppm",    warningHigh: 10, criticalHigh: 100, status: "OFFLINE",     siteId: "site-karim",    location: "Wellsite K-2" },
  { id: "dev-rma-temp-01",  code: "RMA-TEMP-01",  name: "Ambient Temperature",      type: "TEMPERATURE",  unit: "°C",     warningHigh: 60, criticalHigh: 80,  status: "ONLINE",      siteId: "site-rima",     location: "Field Office" },
  { id: "dev-rma-hum-01",   code: "RMA-HUM-01",   name: "Humidity",                 type: "HUMIDITY",     unit: "%",      warningHigh: 85, criticalHigh: 95,  status: "ONLINE",      siteId: "site-rima",     location: "Field Office" },
  { id: "dev-msd-lel-01",   code: "MSD-LEL-01",   name: "LPG Gas LEL",              type: "GAS_LEL",      unit: "%",      warningHigh: 10, criticalHigh: 20,  status: "ONLINE",      siteId: "site-musandam", location: "Loading Jetty" },
  { id: "dev-msd-fire-01",  code: "MSD-FIRE-01",  name: "Fire Detector - Terminal", type: "FIRE_ALARM",   unit: "status",                                     status: "ONLINE",      siteId: "site-musandam", location: "Storage Tanks" },
];

// ─────────────────────────────────────────────
// 4. INCIDENTS (10)
// ─────────────────────────────────────────────

const INCIDENTS = [
  { id: "inc-001", incidentNumber: "INC-2026-0001", title: "H2S Exposure at Makarem Wellhead",     description: "H2S detector triggered at 125 ppm during routine inspection.",       type: "MAJOR",         severity: "CRITICAL", status: "INVESTIGATING", location: "Wellhead B-12",    occurredAt: hoursAgo(4),  siteId: "site-makarem",  reporterId: "user-officer-001",     isAutoEscalated: true },
  { id: "inc-002", incidentNumber: "INC-2026-0002", title: "Scaffolding Near-Miss",                description: "Worker slipped on scaffolding. Fall arrest engaged.",                 type: "NEAR_MISS",     severity: "MEDIUM",   status: "RESOLVED",      location: "Compressor Station",occurredAt: daysAgo(2),   siteId: "site-khazzan",  reporterId: "user-operator-001" },
  { id: "inc-003", incidentNumber: "INC-2026-0003", title: "Chemical Splash - Lab Tech",           description: "Lab technician splashed with caustic. Eye wash used, no injury.",     type: "MINOR",         severity: "MEDIUM",   status: "INVESTIGATING", location: "Laboratory",       occurredAt: daysAgo(1),   siteId: "site-block60",  reporterId: "user-officer-001" },
  { id: "inc-004", incidentNumber: "INC-2026-0004", title: "Crane Hydraulic Failure",              description: "Mobile crane hydraulic line ruptured during lift.",                   type: "EQUIPMENT",     severity: "HIGH",     status: "INVESTIGATING", location: "Construction Area",occurredAt: hoursAgo(18), siteId: "site-block53",  reporterId: "user-supervisor-001",  isAutoEscalated: true },
  { id: "inc-005", incidentNumber: "INC-2026-0005", title: "Unauthorized Entry - Restricted Zone",description: "Contractor entered restricted area. Removed, retraining ordered.",    type: "MINOR",         severity: "LOW",      status: "CLOSED",        location: "Process Zone B",   occurredAt: daysAgo(5),   siteId: "site-khazzan",  reporterId: "user-officer-001" },
  { id: "inc-006", incidentNumber: "INC-2026-0006", title: "Pipeline Leak - Minor",                description: "Small leak on flowline. Isolated and repaired in 2 hours.",           type: "ENVIRONMENTAL", severity: "MEDIUM",   status: "RESOLVED",      location: "Flowline F-23",    occurredAt: daysAgo(3),   siteId: "site-block61",  reporterId: "user-operator-001" },
  { id: "inc-007", incidentNumber: "INC-2026-0007", title: "Slip & Trip - Office",                 description: "Employee slipped on wet floor. First aid administered.",              type: "MINOR",         severity: "LOW",      status: "CLOSED",        location: "Admin Building",   occurredAt: daysAgo(7),   siteId: "site-karim",    reporterId: "user-supervisor-001" },
  { id: "inc-008", incidentNumber: "INC-2026-0008", title: "Heat Stress Case",                     description: "Worker showed heat exhaustion. Medical evaluation cleared.",          type: "MINOR",         severity: "MEDIUM",   status: "CLOSED",        location: "Outdoor Area",     occurredAt: daysAgo(2),   siteId: "site-rima",     reporterId: "user-officer-001" },
  { id: "inc-009", incidentNumber: "INC-2026-0009", title: "Arc Flash - Switchgear",               description: "Arc flash during MCC maintenance. Minor burns.",                      type: "MAJOR",         severity: "HIGH",     status: "INVESTIGATING", location: "MCC Room",         occurredAt: daysAgo(1),   siteId: "site-block60",  reporterId: "user-officer-001",     isAutoEscalated: true },
  { id: "inc-010", incidentNumber: "INC-2026-0010", title: "Helideck Lighting Failure",            description: "Perimeter lights failed during night ops. Flight delayed.",           type: "EQUIPMENT",     severity: "MEDIUM",   status: "RESOLVED",      location: "Helideck",         occurredAt: daysAgo(4),   siteId: "site-musandam", reporterId: "user-supervisor-001" },
];

// ─────────────────────────────────────────────
// 5. PERMITS (5)
// ─────────────────────────────────────────────

const PERMITS = [
  { id: "ptw-001", permitNumber: "PTW-2026-0001", title: "Hot Work — Pipeline Welding",         type: "HOT_WORK",       status: "ACTIVE",   riskLevel: "HIGH",     location: "Pipeline Section 14", validFrom: hoursAgo(2),  validUntil: hoursAgo(-6),  siteId: "site-khazzan",  requesterId: "user-supervisor-001", approverId: "user-manager-001", description: "Welding repairs. Fire watch in place." },
  { id: "ptw-002", permitNumber: "PTW-2026-0002", title: "Confined Space Entry — Tank T-1",     type: "CONFINED_SPACE", status: "ACTIVE",   riskLevel: "CRITICAL", location: "Tank T-1",            validFrom: hoursAgo(1),  validUntil: hoursAgo(-3),  siteId: "site-karim",    requesterId: "user-supervisor-001", approverId: "user-manager-001", description: "Internal tank inspection." },
  { id: "ptw-003", permitNumber: "PTW-2026-0003", title: "Work at Heights — Tower Painting",    type: "HEIGHT_WORK",    status: "ACTIVE",   riskLevel: "MEDIUM",   location: "Met Tower",            validFrom: hoursAgo(3),  validUntil: hoursAgo(-2),  siteId: "site-block60",  requesterId: "user-supervisor-001", approverId: "user-officer-001", description: "Maintenance painting." },
  { id: "ptw-004", permitNumber: "PTW-2026-0004", title: "Electrical Work — MCC Upgrade",       type: "ELECTRICAL",     status: "APPROVED", riskLevel: "HIGH",     location: "MCC Room",             validFrom: daysFromNow(1),validUntil: daysFromNow(3), siteId: "site-block60",  requesterId: "user-supervisor-001", approverId: "user-manager-001", description: "MCC panel upgrade." },
  { id: "ptw-005", permitNumber: "PTW-2026-0005", title: "Excavation — New Pipeline",           type: "EXCAVATION",     status: "PENDING",  riskLevel: "MEDIUM",   location: "North Field",          validFrom: daysFromNow(2),validUntil: daysFromNow(5), siteId: "site-block61",  requesterId: "user-supervisor-001", description: "Trenching for new flowline." },
];

// ─────────────────────────────────────────────
// 6. WEATHER
// ─────────────────────────────────────────────

const WEATHER = [
  { siteId: "site-khazzan",  temperature: 38.5, humidity: 28, windSpeed: 22, windDirection: "NW", condition: "CLEAR",   aqi: 65 },
  { siteId: "site-makarem",  temperature: 41.2, humidity: 22, windSpeed: 18, windDirection: "N",  condition: "CLEAR",   aqi: 110, alertTriggered: true },
  { siteId: "site-block60",  temperature: 39.8, humidity: 25, windSpeed: 35, windDirection: "NE", condition: "CLEAR",   aqi: 78 },
  { siteId: "site-block61",  temperature: 40.1, humidity: 24, windSpeed: 28, windDirection: "N",  condition: "CLEAR",   aqi: 82 },
  { siteId: "site-block65",  temperature: 42.3, humidity: 18, windSpeed: 15, windDirection: "E",  condition: "CLEAR",   aqi: 95 },
  { siteId: "site-block53",  temperature: 43.5, humidity: 16, windSpeed: 25, windDirection: "NW", condition: "CLEAR",   aqi: 130, alertTriggered: true },
  { siteId: "site-karim",    temperature: 39.2, humidity: 30, windSpeed: 12, windDirection: "S",  condition: "CLEAR",   aqi: 55 },
  { siteId: "site-rima",     temperature: 40.5, humidity: 27, windSpeed: 18, windDirection: "SW", condition: "CLEAR",   aqi: 68 },
  { siteId: "site-musandam", temperature: 34.8, humidity: 65, windSpeed: 32, windDirection: "NE", condition: "CLOUDY",  aqi: 72 },
];

// ─────────────────────────────────────────────
// 7. EMERGENCIES (4)
// ─────────────────────────────────────────────

const EMERGENCIES = [
  { id: "emer-001", title: "H2S Release - Makarem Wellhead",   type: "CHEMICAL_SPILL", severity: "CRITICAL", status: "ACTIVE",    evacuationTriggered: true,  droneDispatched: true,  startedAt: minutesAgo(45), siteId: "site-makarem",  commandedById: "user-manager-001" },
  { id: "emer-002", title: "Gas Compressor Fire - Block 60",   type: "FIRE",           severity: "HIGH",     status: "CONTAINED", evacuationTriggered: true,  droneDispatched: true,  startedAt: hoursAgo(8), resolvedAt: hoursAgo(2), siteId: "site-block60",  commandedById: "user-manager-001" },
  { id: "emer-003", title: "Severe Sandstorm Alert",           type: "WEATHER",        severity: "HIGH",     status: "RESOLVED",  evacuationTriggered: false, droneDispatched: false, startedAt: daysAgo(3), resolvedAt: daysAgo(2),  siteId: "site-block53",  commandedById: "user-officer-001" },
  { id: "emer-004", title: "Security Breach - Musandam",       type: "SECURITY",       severity: "MEDIUM",   status: "RESOLVED",  evacuationTriggered: false, droneDispatched: false, startedAt: daysAgo(14),resolvedAt: daysAgo(14), siteId: "site-musandam", commandedById: "user-manager-001" },
];

// ─────────────────────────────────────────────
// 8. ALERTS (8)
// ─────────────────────────────────────────────

const ALERTS = [
  { id: "alert-001", type: "CRITICAL",  title: "H2S Threshold Exceeded",  message: "H2S detector at Makarem Wellhead reading 125 ppm.",         channels: "APP,SMS,WHATSAPP",       status: "SENT", isAutonomous: true, siteId: "site-makarem",  createdAt: minutesAgo(45) },
  { id: "alert-002", type: "WARNING",   title: "Temperature Rising",      message: "Compressor temp at Khazzan rising — currently 58°C.",       channels: "APP,SMS",                status: "SENT", isAutonomous: true, siteId: "site-khazzan",  createdAt: minutesAgo(20) },
  { id: "alert-003", type: "CRITICAL",  title: "Sandstorm - Block 53",    message: "Severe sandstorm. AQI at 130. Outdoor work suspended.",     channels: "APP,SMS,VOICE",          status: "SENT", isAutonomous: true, siteId: "site-block53",  createdAt: minutesAgo(15) },
  { id: "alert-004", type: "WARNING",   title: "Sensor Offline",          message: "Karim H2S detector offline for 45 minutes.",                channels: "APP",                    status: "SENT", isAutonomous: true, siteId: "site-karim",    createdAt: minutesAgo(35) },
  { id: "alert-005", type: "INFO",      title: "Permit Approved",         message: "PTW-2026-0004 (Electrical Work) approved.",                  channels: "APP",                    status: "SENT",                     siteId: "site-block60",  createdAt: hoursAgo(3) },
  { id: "alert-006", type: "EMERGENCY", title: "Evacuation Order",        message: "EVACUATE Makarem Wellhead zone.",                            channels: "APP,SMS,WHATSAPP,VOICE", status: "SENT", isAutonomous: true, siteId: "site-makarem",  createdAt: minutesAgo(44) },
  { id: "alert-007", type: "WARNING",   title: "Wind Speed High",         message: "Wind speed at Block 60 reached 35 km/h.",                    channels: "APP,SMS",                status: "SENT", isAutonomous: true, siteId: "site-block60",  createdAt: hoursAgo(1) },
  { id: "alert-008", type: "INFO",      title: "Inspection Completed",    message: "Routine inspection at Rima Cluster completed.",              channels: "APP",                    status: "SENT",                     siteId: "site-rima",     createdAt: hoursAgo(5) },
];

// ─────────────────────────────────────────────
// 9. RULES (13)
// ─────────────────────────────────────────────

const RULES = [
  { id: "rule-001", name: "H2S Critical Evacuation",         module: "SENSOR",     severity: "CRITICAL", conditions: '[{"field":"sensor.value","operator":">=","value":100}]', actions: '[{"type":"TRIGGER_EVACUATION"},{"type":"SEND_ALERT"}]', requiresApproval: false, triggerCount: 3 },
  { id: "rule-002", name: "H2S Warning Monitor",             module: "SENSOR",     severity: "HIGH",     conditions: '[{"field":"sensor.value","operator":">=","value":10}]',  actions: '[{"type":"SEND_ALERT"}]', requiresApproval: false, triggerCount: 12 },
  { id: "rule-003", name: "Gas LEL Critical",                module: "SENSOR",     severity: "CRITICAL", conditions: '[{"field":"sensor.value","operator":">=","value":20}]',  actions: '[{"type":"TRIGGER_EVACUATION"}]', requiresApproval: false, triggerCount: 1 },
  { id: "rule-004", name: "Fire Alarm Evacuation",           module: "SENSOR",     severity: "CRITICAL", conditions: '[{"field":"sensor.value","operator":"==","value":1}]',   actions: '[{"type":"TRIGGER_EVACUATION"}]', requiresApproval: false, triggerCount: 1 },
  { id: "rule-005", name: "Extreme Temperature Halt",        module: "SENSOR",     severity: "HIGH",     conditions: '[{"field":"sensor.value","operator":">=","value":80}]',  actions: '[{"type":"HALT_OUTDOOR_WORK"}]', requiresApproval: true, triggerCount: 4 },
  { id: "rule-006", name: "High Wind Crane Halt",            module: "SENSOR",     severity: "HIGH",     conditions: '[{"field":"sensor.value","operator":">=","value":40}]',  actions: '[{"type":"HALT_CRANE_OPS"}]', requiresApproval: false, triggerCount: 5 },
  { id: "rule-007", name: "Poor AQI Outdoor Restriction",    module: "SENSOR",     severity: "MEDIUM",   conditions: '[{"field":"sensor.value","operator":">=","value":150}]', actions: '[{"type":"RESTRICT_OUTDOOR"}]', requiresApproval: false, triggerCount: 2 },
  { id: "rule-008", name: "Oxygen Deficient Lockdown",       module: "SENSOR",     severity: "CRITICAL", conditions: '[{"field":"sensor.value","operator":"<","value":16}]',   actions: '[{"type":"LOCKDOWN_AREA"}]', requiresApproval: false, triggerCount: 0 },
  { id: "rule-009", name: "Equipment Expiry Order",          module: "EQUIPMENT",  severity: "MEDIUM",   conditions: '[{"field":"equipment.daysToExpiry","operator":"<=","value":30}]', actions: '[{"type":"AUTO_PURCHASE_ORDER"}]', requiresApproval: true, triggerCount: 6 },
  { id: "rule-010", name: "Training Expired Access Revoke", module: "COMPLIANCE", severity: "HIGH",     conditions: '[{"field":"training.daysOverdue","operator":">","value":0}]', actions: '[{"type":"REVOKE_ACCESS"}]', requiresApproval: false, triggerCount: 8 },
  { id: "rule-011", name: "Compliance Overdue Escalate",     module: "COMPLIANCE", severity: "HIGH",     conditions: '[{"field":"compliance.daysOverdue","operator":">","value":7}]', actions: '[{"type":"ESCALATE_TO_MANAGER"}]', requiresApproval: false, triggerCount: 3 },
  { id: "rule-012", name: "Contractor Rating Drop",          module: "CONTRACTOR", severity: "MEDIUM",   conditions: '[{"field":"contractor.safetyRating","operator":"<","value":50}]', actions: '[{"type":"AUTO_SUSPEND"}]', requiresApproval: true, triggerCount: 1 },
  { id: "rule-013", name: "Critical Incident Auto-Escalate", module: "INCIDENT",   severity: "CRITICAL", conditions: '[{"field":"incident.severity","operator":"==","value":"CRITICAL"}]', actions: '[{"type":"ESCALATE_TO_HSSE_MANAGER"}]', requiresApproval: false, triggerCount: 3 },
];

// ─────────────────────────────────────────────
// 10. PIPELINES — 5 خطوط أنابيب عُمانية واقعية
// ─────────────────────────────────────────────

const PIPELINES = [
  {
    id:          "pipe-khz-mkm",
    code:        "PL-KHZ-001",
    name:        "Khazzan–Makarem Gas Trunk Line",
    nameAr:      "خط الغاز الرئيسي خزان–المكارم",
    length:      85.4,
    diameter:    24,
    material:    "STEEL",
    status:      "OPERATIONAL",
    productType: "NATURAL_GAS",
    pressureMin: 55,
    pressureMax: 95,
    flowRate:    1240,
    startSiteId: "site-khazzan",
    endSiteId:   "site-makarem",
    startLat:    21.4500, startLng: 56.4500,
    endLat:      22.6500, endLng:   55.9800,
    installedAt: new Date("2018-03-15"),
    notes:       "Main gas export line from Khazzan tight-gas field to Makarem processing plant.",
    points: [
      { code: "KHZ-PP-01", positionKm: 0,    lat: 21.4500, lng: 56.4500, pMin: 55, pMax: 95, pCurr: 78.2, flow: 1240, temp: 42 },
      { code: "KHZ-PP-02", positionKm: 17.1, lat: 21.6200, lng: 56.3800, pMin: 55, pMax: 95, pCurr: 75.4, flow: 1235, temp: 43 },
      { code: "KHZ-PP-03", positionKm: 34.2, lat: 21.8100, lng: 56.2900, pMin: 55, pMax: 95, pCurr: 71.8, flow: 1228, temp: 44 },
      { code: "KHZ-PP-04", positionKm: 51.0, lat: 22.0400, lng: 56.2000, pMin: 55, pMax: 95, pCurr: 67.3, flow: 1220, temp: 45 },
      { code: "KHZ-PP-05", positionKm: 68.3, lat: 22.2700, lng: 56.1000, pMin: 55, pMax: 95, pCurr: 62.1, flow: 1210, temp: 46 },
      { code: "KHZ-PP-06", positionKm: 85.4, lat: 22.6500, lng: 55.9800, pMin: 55, pMax: 95, pCurr: 58.7, flow: 1198, temp: 47 },
    ],
  },
  {
    id:          "pipe-bl60-bl61",
    code:        "PL-BL60-001",
    name:        "Block 60–61 Condensate Line",
    nameAr:      "خط المتكثفات بلوك 60–61",
    length:      42.7,
    diameter:    16,
    material:    "STEEL",
    status:      "OPERATIONAL",
    productType: "CONDENSATE",
    pressureMin: 30,
    pressureMax: 60,
    flowRate:    420,
    startSiteId: "site-block60",
    endSiteId:   "site-block61",
    startLat:    21.3200, startLng: 56.7300,
    endLat:      21.5100, endLng:   56.5400,
    installedAt: new Date("2020-07-01"),
    notes:       "Condensate transfer line from Block 60 separators to Block 61 processing.",
    points: [
      { code: "BL60-PP-01", positionKm: 0,    lat: 21.3200, lng: 56.7300, pMin: 30, pMax: 60, pCurr: 48.5, flow: 420, temp: 38 },
      { code: "BL60-PP-02", positionKm: 10.7, lat: 21.3640, lng: 56.6825, pMin: 30, pMax: 60, pCurr: 45.2, flow: 418, temp: 39 },
      { code: "BL60-PP-03", positionKm: 21.4, lat: 21.4150, lng: 56.6350, pMin: 30, pMax: 60, pCurr: 41.9, flow: 416, temp: 40 },
      { code: "BL60-PP-04", positionKm: 32.1, lat: 21.4660, lng: 56.5875, pMin: 30, pMax: 60, pCurr: 38.4, flow: 413, temp: 40 },
      { code: "BL60-PP-05", positionKm: 42.7, lat: 21.5100, lng: 56.5400, pMin: 30, pMax: 60, pCurr: 35.1, flow: 410, temp: 41 },
    ],
  },
  {
    id:          "pipe-bl53-krm",
    code:        "PL-BL53-001",
    name:        "Mukhaizna–Karim Crude Export",
    nameAr:      "خط تصدير النفط الخام مخيزنة–كريم",
    length:      124.8,
    diameter:    20,
    material:    "STEEL",
    status:      "OPERATIONAL",
    productType: "CRUDE_OIL",
    pressureMin: 25,
    pressureMax: 55,
    flowRate:    890,
    startSiteId: "site-block53",
    endSiteId:   "site-karim",
    startLat:    19.4200, startLng: 56.8900,
    endLat:      20.7800, endLng:   56.5100,
    installedAt: new Date("2016-11-20"),
    notes:       "Heavy crude export pipeline from Mukhaizna EOR to Karim cluster hub. Heated sections due to viscosity.",
    points: [
      { code: "BL53-PP-01", positionKm: 0,    lat: 19.4200, lng: 56.8900, pMin: 25, pMax: 55, pCurr: 49.2, flow: 890, temp: 55 },
      { code: "BL53-PP-02", positionKm: 25.0, lat: 19.6976, lng: 56.8208, pMin: 25, pMax: 55, pCurr: 44.8, flow: 882, temp: 56 },
      { code: "BL53-PP-03", positionKm: 50.0, lat: 19.9752, lng: 56.7517, pMin: 25, pMax: 55, pCurr: 39.5, flow: 875, temp: 57 },
      { code: "BL53-PP-04", positionKm: 75.0, lat: 20.2528, lng: 56.6826, pMin: 25, pMax: 55, pCurr: 34.1, flow: 867, temp: 58 },
      { code: "BL53-PP-05", positionKm: 100.0,lat: 20.5304, lng: 56.6135, pMin: 25, pMax: 55, pCurr: 31.7, flow: 860, temp: 58 },
      { code: "BL53-PP-06", positionKm: 124.8,lat: 20.7800, lng: 56.5100, pMin: 25, pMax: 55, pCurr: 28.4, flow: 852, temp: 59 },
    ],
  },
  {
    id:          "pipe-msd-lpg",
    code:        "PL-MSD-001",
    name:        "Musandam LPG Export Header",
    nameAr:      "خط تصدير الغاز المسال مسندم",
    length:      18.2,
    diameter:    12,
    material:    "STEEL",
    status:      "OPERATIONAL",
    productType: "LPG",
    pressureMin: 10,
    pressureMax: 25,
    flowRate:    310,
    startSiteId: "site-musandam",
    endSiteId:   null,
    startLat:    26.2000, startLng: 56.2500,
    endLat:      26.2850, endLng:   56.3400,
    installedAt: new Date("2019-05-10"),
    notes:       "LPG export header from Musandam terminal to loading jetty. High-consequence segment.",
    points: [
      { code: "MSD-PP-01", positionKm: 0,    lat: 26.2000, lng: 56.2500, pMin: 10, pMax: 25, pCurr: 21.3, flow: 310, temp: 28 },
      { code: "MSD-PP-02", positionKm: 6.1,  lat: 26.2283, lng: 56.2800, pMin: 10, pMax: 25, pCurr: 19.8, flow: 308, temp: 29 },
      { code: "MSD-PP-03", positionKm: 12.1, lat: 26.2567, lng: 56.3100, pMin: 10, pMax: 25, pCurr: 17.5, flow: 306, temp: 29 },
      { code: "MSD-PP-04", positionKm: 18.2, lat: 26.2850, lng: 56.3400, pMin: 10, pMax: 25, pCurr: 15.2, flow: 304, temp: 30 },
    ],
  },
  {
    id:          "pipe-bl65-rma",
    code:        "PL-BL65-001",
    name:        "Block 65–Rima Light Oil Line",
    nameAr:      "خط النفط الخفيف بلوك 65–ريما",
    length:      58.3,
    diameter:    14,
    material:    "STEEL",
    status:      "MAINTENANCE",
    productType: "CRUDE_OIL",
    pressureMin: 20,
    pressureMax: 45,
    flowRate:    null,
    startSiteId: "site-block65",
    endSiteId:   "site-rima",
    startLat:    19.6800, startLng: 56.2400,
    endLat:      19.9300, endLng:   55.7800,
    installedAt: new Date("2021-02-28"),
    notes:       "Light crude transfer. Currently under scheduled pigging maintenance.",
    points: [
      { code: "BL65-PP-01", positionKm: 0,    lat: 19.6800, lng: 56.2400, pMin: 20, pMax: 45, pCurr: null, flow: null, temp: null },
      { code: "BL65-PP-02", positionKm: 14.6, lat: 19.7413, lng: 56.1252, pMin: 20, pMax: 45, pCurr: null, flow: null, temp: null },
      { code: "BL65-PP-03", positionKm: 29.2, lat: 19.8027, lng: 56.0103, pMin: 20, pMax: 45, pCurr: null, flow: null, temp: null },
      { code: "BL65-PP-04", positionKm: 43.7, lat: 19.8640, lng: 55.8955, pMin: 20, pMax: 45, pCurr: null, flow: null, temp: null },
      { code: "BL65-PP-05", positionKm: 58.3, lat: 19.9300, lng: 55.7800, pMin: 20, pMax: 45, pCurr: null, flow: null, temp: null },
    ],
  },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getBaseValue(type: string): number {
  switch (type) {
    case "H2S_DETECTOR": return 2 + Math.random() * 5;
    case "TEMPERATURE":  return 30 + Math.random() * 20;
    case "PRESSURE":     return 4 + Math.random() * 3;
    case "OXYGEN":       return 20.5 + Math.random() * 0.8;
    case "HUMIDITY":     return 30 + Math.random() * 40;
    case "VIBRATION":    return 5 + Math.random() * 15;
    case "NOISE":        return 60 + Math.random() * 20;
    case "GAS_LEL":      return 0.5 + Math.random() * 2;
    case "WIND":         return 10 + Math.random() * 25;
    case "AQI":          return 50 + Math.random() * 80;
    default:             return Math.random() * 50;
  }
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding AEGIS database...\n");

  // 1. Users
  console.log("👥 Users:");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, department: u.department, isActive: true, passwordHash },
      create: { ...u, passwordHash, isActive: true },
    });
    console.log(`   ✓ ${u.role.padEnd(15)} ${u.email}`);
  }

  // 2. Sites
  console.log("\n🏭 Sites:");
  for (const s of SITES) {
    await prisma.site.upsert({ where: { code: s.code }, update: s, create: s });
    console.log(`   ✓ ${s.code.padEnd(10)} ${s.name}`);
  }

  // 3. Devices
  console.log("\n📡 IoT Devices:");
  for (const d of DEVICES) {
    await prisma.ioTDevice.upsert({
      where: { code: d.code },
      update: { ...d, lastReadingAt: minutesAgo(2) },
      create: { ...d, lastReadingAt: minutesAgo(2) },
    });
  }
  console.log(`   ✓ ${DEVICES.length} devices created`);

  // 4. Sensor Readings
  console.log("\n📊 Sensor Readings:");
  await prisma.sensorReading.deleteMany({});
  let readingCount = 0;
  for (const device of DEVICES) {
    if (device.status === "OFFLINE" || device.type === "CAMERA" || device.type === "FIRE_ALARM") continue;
    for (let i = 0; i < 24; i++) {
      const baseValue = getBaseValue(device.type);
      const noise = (Math.random() - 0.5) * baseValue * 0.15;
      const value = Math.max(0, baseValue + noise);
      const isAnomaly = device.criticalHigh ? value >= device.criticalHigh : false;
      await prisma.sensorReading.create({
        data: {
          deviceId: device.id,
          value,
          isAnomaly,
          alertLevel: isAnomaly ? "CRITICAL" : value >= (device.warningHigh ?? Infinity) ? "WARNING" : "NORMAL",
          recordedAt: hoursAgo(23 - i),
        },
      });
      readingCount++;
    }
  }
  console.log(`   ✓ ${readingCount} sensor readings generated`);

  // 5. Incidents
  console.log("\n⚠️  Incidents:");
  for (const inc of INCIDENTS) {
    await prisma.incident.upsert({
      where: { incidentNumber: inc.incidentNumber },
      update: inc,
      create: inc,
    });
  }
  console.log(`   ✓ ${INCIDENTS.length} incidents created`);

  // 6. Permits
  console.log("\n📋 Permits:");
  for (const p of PERMITS) {
    await prisma.permit.upsert({
      where: { permitNumber: p.permitNumber },
      update: p,
      create: p,
    });
  }
  console.log(`   ✓ ${PERMITS.length} permits created`);

  // 7. Weather
  console.log("\n🌤️  Weather:");
  await prisma.weatherReading.deleteMany({});
  for (const w of WEATHER) {
    await prisma.weatherReading.create({
      data: { ...w, recordedAt: minutesAgo(10) },
    });
  }
  console.log(`   ✓ ${WEATHER.length} weather readings`);

  // 8. Emergencies
  console.log("\n🚨 Emergencies:");
  for (const e of EMERGENCIES) {
    await prisma.emergencyEvent.upsert({
      where: { id: e.id },
      update: e,
      create: e,
    });
  }
  const activeCount = EMERGENCIES.filter(e => e.status === "ACTIVE").length;
  console.log(`   ✓ ${EMERGENCIES.length} emergencies (${activeCount} active)`);

  // 9. Alerts
  console.log("\n🔔 Alerts:");
  await prisma.alert.deleteMany({});
  for (const a of ALERTS) {
    await prisma.alert.create({ data: a });
  }
  console.log(`   ✓ ${ALERTS.length} alerts`);

  // 10. Rules
  console.log("\n⚙️  Rules:");
  for (const r of RULES) {
    await prisma.rule.upsert({
      where: { id: r.id },
      update: r,
      create: r,
    });
  }
  console.log(`   ✓ ${RULES.length} rules`);

  // 10. Pipelines + PressurePoints
  console.log("\n🔧 Pipelines:");
  for (const pl of PIPELINES) {
    const { points, id: plId, ...pipelineFields } = pl;
    await prisma.pipeline.upsert({
      where:  { code: pl.code },
      update: pipelineFields,
      create: { id: plId, ...pipelineFields },
    });

    // Upsert pressure points
    for (const pt of points) {
      await prisma.pressurePoint.upsert({
        where:  { code: pt.code },
        update: {
          pipelineId:      pl.id,
          latitude:        pt.lat,
          longitude:       pt.lng,
          positionKm:      pt.positionKm,
          expectedMin:     pt.pMin,
          expectedMax:     pt.pMax,
          currentPressure: pt.pCurr,
          currentFlow:     pt.flow,
          currentTemp:     pt.temp,
          status:          pt.pCurr === null ? "NORMAL"
                           : pt.pCurr < pt.pMin ? "CRITICAL"
                           : pt.pCurr > pt.pMax ? "CRITICAL"
                           : pt.pCurr < pt.pMin + 5 ? "WARNING"
                           : "NORMAL",
          lastReadingAt:   pt.pCurr !== null ? minutesAgo(5) : null,
        },
        create: {
          code:            pt.code,
          pipelineId:      pl.id,
          latitude:        pt.lat,
          longitude:       pt.lng,
          positionKm:      pt.positionKm,
          expectedMin:     pt.pMin,
          expectedMax:     pt.pMax,
          currentPressure: pt.pCurr,
          currentFlow:     pt.flow,
          currentTemp:     pt.temp,
          status:          pt.pCurr === null ? "NORMAL"
                           : pt.pCurr < pt.pMin ? "CRITICAL"
                           : pt.pCurr > pt.pMax ? "CRITICAL"
                           : pt.pCurr < pt.pMin + 5 ? "WARNING"
                           : "NORMAL",
          lastReadingAt:   pt.pCurr !== null ? minutesAgo(5) : null,
        },
      });
    }
    console.log(`   ✓ ${pl.code.padEnd(15)} ${pl.name} (${points.length} pressure points)`);
  }

  console.log(`\n🔑 Password for all users: ${SEED_PASSWORD}`);
  console.log("\n✅ Seeding complete!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });