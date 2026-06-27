/**
 * Autonomy settings — Kill Switch + per-module toggles + budget caps.
 * Single-row table (id="singleton"). All autonomous code paths MUST check here.
 */
import { db } from "@/lib/db";

const SINGLETON_ID = "singleton";

export type AutonomyModule =
  | "pipeline"
  | "forecast"
  | "voice"
  | "permit"
  | "vision";

export interface AutonomySettingsDTO {
  globalEnabled: boolean;
  pipelineLoopEnabled: boolean;
  forecastEnabled: boolean;
  voiceActionsEnabled: boolean;
  permitAutoApproval: boolean;
  visionAutoActions: boolean;
  demoMode: boolean;
  pipelinePollSeconds: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
}

const DEFAULTS: AutonomySettingsDTO = {
  globalEnabled: true,
  pipelineLoopEnabled: true,
  forecastEnabled: true,
  voiceActionsEnabled: true,
  permitAutoApproval: false,
  visionAutoActions: true,
  demoMode: false,
  pipelinePollSeconds: 30,
  dailyBudgetUsd: 50,
  monthlyBudgetUsd: 1000,
  maxCallsPerMinute: 20,
  maxCallsPerHour: 200,
};

/** Get current settings, creating the singleton if missing. */
export async function getAutonomySettings(): Promise<AutonomySettingsDTO> {
  const row = await db.autonomySettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, ...DEFAULTS },
  });
  return {
    globalEnabled: row.globalEnabled,
    pipelineLoopEnabled: row.pipelineLoopEnabled,
    forecastEnabled: row.forecastEnabled,
    voiceActionsEnabled: row.voiceActionsEnabled,
    permitAutoApproval: row.permitAutoApproval,
    visionAutoActions: row.visionAutoActions,
    demoMode: row.demoMode,
    pipelinePollSeconds: row.pipelinePollSeconds,
    dailyBudgetUsd: row.dailyBudgetUsd,
    monthlyBudgetUsd: row.monthlyBudgetUsd,
    maxCallsPerMinute: row.maxCallsPerMinute,
    maxCallsPerHour: row.maxCallsPerHour,
  };
}

/** Update settings (admin only — enforced at route layer). */
export async function updateAutonomySettings(
  patch: Partial<AutonomySettingsDTO>,
  userId?: string,
): Promise<AutonomySettingsDTO> {
  await db.autonomySettings.upsert({
    where: { id: SINGLETON_ID },
    update: { ...patch, lastModifiedById: userId },
    create: { id: SINGLETON_ID, ...DEFAULTS, ...patch, lastModifiedById: userId },
  });
  return getAutonomySettings();
}

/** Module-level enable check. Returns the *reason* if blocked, or null if allowed. */
export async function checkAutonomyAllowed(
  module: AutonomyModule,
): Promise<{ allowed: boolean; reason?: string }> {
  const s = await getAutonomySettings();
  if (!s.globalEnabled) {
    return { allowed: false, reason: "Autonomy globally disabled (kill switch active)" };
  }
  if (s.demoMode) {
    // In demo mode, only manual triggers run — autonomous loops blocked.
    return { allowed: false, reason: "Demo mode active — only manual triggers run" };
  }
  switch (module) {
    case "pipeline":
      if (!s.pipelineLoopEnabled)
        return { allowed: false, reason: "Pipeline loop disabled" };
      break;
    case "forecast":
      if (!s.forecastEnabled)
        return { allowed: false, reason: "Forecast disabled" };
      break;
    case "voice":
      if (!s.voiceActionsEnabled)
        return { allowed: false, reason: "Voice actions disabled" };
      break;
    case "permit":
      // Note: permit module only checks global kill switch, not permitAutoApproval.
      // permitAutoApproval controls whether the RESULT auto-flips to APPROVED —
      // the AI *review* itself always runs so managers get AI reasoning.
      break;
    case "vision":
      if (!s.visionAutoActions)
        return { allowed: false, reason: "Vision auto-actions disabled" };
      break;
  }
  return { allowed: true };
}
