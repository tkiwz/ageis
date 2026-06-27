// AEGIS — App-wide constants

export const APP = {
  NAME: "AEGIS",
  TAGLINE: "HSSE Command Platform",
  TAGLINE_AR: "منصة قيادة الصحة والسلامة والأمن والبيئة",
  VERSION: "1.0.0",
} as const;

// ───────── Roles & Permissions ─────────

export const ROLES = {
  ADMIN: "ADMIN",
  HSSE_MANAGER: "HSSE_MANAGER",
  SAFETY_OFFICER: "SAFETY_OFFICER",
  SUPERVISOR: "SUPERVISOR",
  OPERATOR: "OPERATOR",
  CONTRACTOR: "CONTRACTOR",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, { en: string; ar: string }> = {
  ADMIN: { en: "Administrator", ar: "مدير النظام" },
  HSSE_MANAGER: { en: "HSSE Manager", ar: "مدير السلامة" },
  SAFETY_OFFICER: { en: "Safety Officer", ar: "مسؤول السلامة" },
  SUPERVISOR: { en: "Supervisor", ar: "مشرف" },
  OPERATOR: { en: "Operator", ar: "مشغل" },
  CONTRACTOR: { en: "Contractor", ar: "مقاول" },
};

// ───────── Risk Levels ─────────

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ───────── Incident Types ─────────

export const INCIDENT_TYPES = [
  "NEAR_MISS",
  "MINOR",
  "MAJOR",
  "FATAL",
  "ENVIRONMENTAL",
  "EQUIPMENT",
] as const;

// ───────── Permit Types ─────────

export const PERMIT_TYPES = [
  "HOT_WORK",
  "CONFINED_SPACE",
  "HEIGHT_WORK",
  "ELECTRICAL",
  "EXCAVATION",
  "CHEMICAL",
] as const;

// ───────── IoT Sensor Thresholds ─────────

export interface SensorThreshold {
  unit: string;
  warningHigh?: number;
  criticalHigh?: number;
  warningLow?: number;
  criticalLow?: number;
}

export const SENSOR_THRESHOLDS: Record<string, SensorThreshold> = {
  H2S_DETECTOR:   { unit: "ppm", warningHigh: 10, criticalHigh: 100 },
  TEMPERATURE:    { unit: "°C",  warningHigh: 60, criticalHigh: 80, warningLow: -10 },
  PRESSURE:       { unit: "bar", warningHigh: 8,  criticalHigh: 10 },
  OXYGEN:         { unit: "%",   warningLow: 19,  criticalLow: 16, warningHigh: 23, criticalHigh: 25 },
  CO2:            { unit: "%",   warningHigh: 3,  criticalHigh: 5 },
  HUMIDITY:       { unit: "%",   warningHigh: 85, criticalHigh: 95 },
  VIBRATION:      { unit: "mm/s",warningHigh: 30, criticalHigh: 50 },
  NOISE:          { unit: "dB",  warningHigh: 85, criticalHigh: 130 },
  GAS_LEL:        { unit: "%",   warningHigh: 10, criticalHigh: 20 },
  WIND:           { unit: "km/h",warningHigh: 40, criticalHigh: 60 },
  AQI:            { unit: "AQI", warningHigh: 100,criticalHigh: 200 },
};

// ───────── Production Types (Site) ─────────

export const PRODUCTION_TYPES: Record<string, { en: string; ar: string; color: string }> = {
  OIL:          { en: "Oil",            ar: "نفط",          color: "purple" },
  GAS:          { en: "Gas",            ar: "غاز",          color: "cyan" },
  OIL_AND_GAS:  { en: "Oil & Gas",      ar: "نفط وغاز",     color: "pink" },
  HEAVY_OIL:    { en: "Heavy Oil",      ar: "نفط ثقيل",     color: "orange" },
  REFINERY:     { en: "Refinery",       ar: "مصفاة",        color: "red" },
  CHEMICAL:     { en: "Chemical Plant", ar: "مصنع كيماويات", color: "yellow" },
  CONSTRUCTION: { en: "Construction",   ar: "إنشاءات",      color: "blue" },
};

// ───────── Claude Model ─────────

// Must match CLAUDE_MODEL in .env and claude-client.ts default
export const AI_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";
export const AI_MAX_TOKENS = 1024;