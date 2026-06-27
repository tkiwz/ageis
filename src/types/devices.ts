// Field device types

export type DeviceType = "PI_VISION" | "ESP32_WEARABLE";
export type DeviceStatus = "ONLINE" | "OFFLINE" | "ERROR" | "MAINTENANCE";

export interface FieldDeviceListItem {
  id: string;
  code: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  ipAddress: string | null;
  port: number | null;
  batteryPercent: number | null;
  lastSeenAt: string | null;
  detectionsCount: number;
  alertsCount: number;
  site: { id: string; code: string; name: string } | null;
}

// Raw Pi /stats response shape
export interface PiStatsResponse {
  ready: boolean;
  status?: "OK" | "WARNING" | "INFO" | "starting";
  top_class?: string;
  top_confidence?: number;
  all_scores?: Record<string, number>;
  fps?: number;
  timestamp?: number;
  recent_alerts?: Array<{
    label: string;
    confidence: number;
    timestamp: number;
  }>;
}

export interface ConnectPiRequest {
  name: string;
  ipAddress: string;
  port?: number;
  siteId?: string;
}

export interface VisionDetectionRecord {
  id: string;
  label: string;
  confidence: number;
  status: string;
  aiAnalyzed: boolean;
  aiSeverity: string | null;
  aiReasoning: string | null;
  aiActions: string[] | null;
  alertId: string | null;
  detectedAt: string;
}
