/**
 * Maps any stored status / severity / type value to one of five visual tones.
 * Pages never pick colours themselves — they call toneFor(value).
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<string, Tone> = {
  // severity
  INFO: "info", LOW: "success", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger", EMERGENCY: "danger", WARNING: "warning",
  // healthy / done
  ACTIVE: "success", APPROVED: "success", COMPLETED: "success", DONE: "success", RESOLVED: "success", CLOSED: "neutral",
  ONLINE: "success", OPERATIONAL: "success", NORMAL: "success", OK: "success", COMPLIANT: "success", EXECUTED: "success", PUBLISHED: "success", EXEMPT: "neutral",
  CONTAINED: "success", ACKNOWLEDGED: "neutral", ACKED: "neutral", AUTO_APPLIED: "success",
  // in progress / waiting
  PENDING: "warning", DRAFT: "neutral", SUBMITTED: "info", IN_REVIEW: "info", IN_PROGRESS: "info", TODO: "neutral",
  SCHEDULED: "info", REPORTED: "warning", INVESTIGATING: "info", PROCESSING: "info", THINKING: "info", RUNNING: "info",
  MAINTENANCE: "warning", INSPECTION: "info", SENT: "info", AI_PROCESSED: "info", OPEN: "warning",
  // bad
  OVERDUE: "danger", ESCALATED: "danger", REJECTED: "danger", REVOKED: "danger", SUSPENDED: "danger", EXPIRED: "neutral", CANCELLED: "neutral",
  OFFLINE: "neutral", ERROR: "danger", SHUTDOWN: "danger", FAILED: "danger", NON_COMPLIANT: "danger", FALSE_ALARM: "neutral",
  GAS_CRITICAL: "danger", FLAME: "danger", FIRE: "danger", LEAK: "danger", GAS_WARNING: "warning",
};

export function toneFor(value: string | null | undefined): Tone {
  return (value && TONES[value]) || "neutral";
}

/** Tailwind classes per tone (tokens only). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground", info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger",
};
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60", info: "bg-info", success: "bg-success", warning: "bg-warning", danger: "bg-danger",
};
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground", info: "bg-info/12 text-info", success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning", danger: "bg-danger/12 text-danger",
};
export const TONE_EDGE: Record<Tone, string> = {
  neutral: "border-s-border", info: "border-s-info", success: "border-s-success", warning: "border-s-warning", danger: "border-s-danger",
};
