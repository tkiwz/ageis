import type { Role } from "@/lib/constants";

// ───────── API ─────────

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

// ───────── Session ─────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  avatarUrl: string | null;
}

// ───────── Server-Sent Events ─────────

export type SseEventType =
  | "sensor:reading"
  | "alert:new"
  | "incident:update"
  | "permit:update"
  | "emergency:active"
  | "action:pending"
  | "system:heartbeat";

export interface SseEvent<T = unknown> {
  type: SseEventType;
  timestamp: string; // ISO date
  payload: T;
}

// ───────── Dashboard KPIs ─────────

export interface DashboardKpis {
  activeSites: number;
  totalIncidents: number;
  openIncidents: number;
  activePermits: number;
  onlineSensors: number;
  totalSensors: number;
  criticalAlerts: number;
  pendingActions: number;
  complianceScore: number; // 0-100
  overdueTraining: number;
}

// ───────── AI Analysis ─────────

export interface IncidentAnalysis {
  severityRecommendation: string; // LOW | MEDIUM | HIGH | CRITICAL
  suggestedActions: string[];
  rootCauseHypotheses: string[];
  riskFactors: string[];
  confidence: number; // 0-1
}

export interface ControlSuggestion {
  hazard: string;
  controls: Array<{
    level: "ELIMINATION" | "SUBSTITUTION" | "ENGINEERING" | "ADMINISTRATIVE" | "PPE";
    description: string;
    effortLevel: "LOW" | "MEDIUM" | "HIGH";
  }>;
}