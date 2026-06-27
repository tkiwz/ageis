import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";

/** Merge Tailwind classes safely (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "5 minutes ago" relative-time formatter. */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/** Short datetime (e.g. "May 18, 14:32"). */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM dd, HH:mm");
}

/** Date only (e.g. "May 18, 2026"). */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM dd, yyyy");
}

/** Risk-level → Tailwind classes (text + border + bg). */
export function riskColor(level: string | null | undefined): string {
  switch ((level ?? "").toUpperCase()) {
    case "LOW":      return "text-risk-low border-risk-low/30 bg-risk-low/10";
    case "MEDIUM":   return "text-risk-medium border-risk-medium/30 bg-risk-medium/10";
    case "HIGH":     return "text-risk-high border-risk-high/30 bg-risk-high/10";
    case "CRITICAL": return "text-risk-critical border-risk-critical/30 bg-risk-critical/10";
    default:         return "text-muted-foreground border-border bg-muted/30";
  }
}

/** Generate a numbered string (e.g. "INC-2026-0001"). */
export function generateNumber(prefix: string, sequence: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Safe JSON.parse with a fallback. */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Truncate text with an ellipsis. */
export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/** Format a number with thousand-separators. */
export function num(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Compute a percentage 0-100 from a ratio. */
export function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}