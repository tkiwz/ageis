/**
 * Runtime environment validation.
 *
 * Fails LOUDLY at boot if production is misconfigured.
 * Provides typed accessors so the rest of the app can rely on values being set.
 */

import { log } from "@/lib/observability/logger";

interface EnvShape {
  NODE_ENV: "development" | "production" | "test";
  DATABASE_URL: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL?: string;
  ANTHROPIC_API_KEY: string;
  CLAUDE_MODEL?: string;
  GEMINI_API_KEY?: string;
  CALLMEBOT_PHONE?: string;
  CALLMEBOT_APIKEY?: string;
  CRON_SECRET?: string;
  METRICS_TOKEN?: string;
  DEVICE_INGEST_SECRET?: string;
  LOG_LEVEL?: "debug" | "info" | "warn" | "error";
  SENTRY_DSN?: string;
}

const REQUIRED_IN_PROD: (keyof EnvShape)[] = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "METRICS_TOKEN",
];

// Secrets that must reach a minimum entropy bar in production
const MIN_SECRET_LEN = 24;
const SECRET_KEYS: (keyof EnvShape)[] = ["NEXTAUTH_SECRET", "CRON_SECRET", "METRICS_TOKEN", "DEVICE_INGEST_SECRET"];

let cached: EnvShape | null = null;

export function validateEnv(): EnvShape {
  if (cached) return cached;

  const env = process.env as unknown as EnvShape;
  const errors: string[] = [];

  const isProd = env.NODE_ENV === "production";

  if (isProd) {
    for (const k of REQUIRED_IN_PROD) {
      if (!env[k]) errors.push(`${k} is required in production`);
    }
    for (const k of SECRET_KEYS) {
      const v = env[k];
      if (v && v.length < MIN_SECRET_LEN) {
        errors.push(`${k} is too short (${v.length} chars, need ≥${MIN_SECRET_LEN})`);
      }
      if (v && /dummy|change|secret|password|123/i.test(v)) {
        errors.push(`${k} looks like a placeholder — rotate it`);
      }
    }
    if (env.DATABASE_URL?.startsWith("file:")) {
      errors.push("DATABASE_URL points to SQLite — use PostgreSQL in production");
    }
    if (env.NEXTAUTH_URL && !env.NEXTAUTH_URL.startsWith("https://")) {
      errors.push("NEXTAUTH_URL must use HTTPS in production");
    }
  }

  if (errors.length > 0) {
    log.fatal("Environment validation failed", undefined, { errors });
    if (isProd) {
      throw new Error(`Environment validation failed:\n - ${errors.join("\n - ")}`);
    } else {
      log.warn("Continuing despite env issues (NODE_ENV != production)");
    }
  } else {
    log.info("Environment validated", { node_env: env.NODE_ENV });
  }

  cached = env;
  return env;
}

/** Convenience accessor — call at module load in server-only code. */
export const env = (typeof window === "undefined" ? validateEnv() : (process.env as unknown as EnvShape));
