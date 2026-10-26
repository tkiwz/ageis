/**
 * Production logger — structured JSON in prod, pretty in dev.
 *
 * Features:
 *   - Levels: debug, info, warn, error, fatal
 *   - Automatic redaction of obvious secrets in messages
 *   - Request-scoped child loggers (carry traceId, userId)
 *   - Sentry error capture when SENTRY_DSN is configured
 *   - Falls back cleanly when no observability backend is present
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };

const ENV_LEVEL: LogLevel = ((process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "production" ? "info" : "debug"));
const IS_PROD = process.env.NODE_ENV === "production";

interface LogContext {
  traceId?: string;
  userId?: string;
  module?: string;
  [k: string]: unknown;
}

interface LogPayload {
  level: LogLevel;
  msg: string;
  ts: string;
  ctx?: LogContext;
  err?: { name: string; message: string; stack?: string };
}

const REDACTION_RE = /(api[_-]?key|secret|token|password|authorization|cookie|bearer)["'\s:=]+([^\s"',}]{4,})/gi;
function redact(s: string): string {
  return s.replace(REDACTION_RE, (_m, key) => `${key}=<redacted>`);
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[ENV_LEVEL];
}

function emit(payload: LogPayload): void {
  if (IS_PROD) {
    // JSON line — easy to ingest in CloudWatch / Datadog / Loki
    const safe = {
      ...payload,
      msg: redact(payload.msg),
      ctx: payload.ctx,
      err: payload.err
        ? { ...payload.err, stack: payload.err.stack ? redact(payload.err.stack) : undefined }
        : undefined,
    };
    const stream = payload.level === "error" || payload.level === "fatal" ? process.stderr : process.stdout;
    stream.write(JSON.stringify(safe) + "\n");
  } else {
    const tag = `[${payload.level.toUpperCase()}]`;
    const ctxStr = payload.ctx ? ` ${JSON.stringify(payload.ctx)}` : "";
    const errStr = payload.err ? `\n  ${payload.err.name}: ${payload.err.message}\n${payload.err.stack ?? ""}` : "";
    const out = `${tag} ${redact(payload.msg)}${ctxStr}${errStr}`;
    if (payload.level === "error" || payload.level === "fatal") console.error(out);
    else if (payload.level === "warn") console.warn(out);
    else console.log(out);
  }

  // Forward errors to Sentry when SENTRY_DSN is set (plain HTTP, no SDK)
  if ((payload.level === "error" || payload.level === "fatal") && payload.err && process.env.SENTRY_DSN) {
    sentryCapture(payload).catch(() => { /* never break callers */ });
  }
}

/**
 * Sends one error event to Sentry over its plain HTTP envelope API (no SDK).
 * DSN format: https://<publicKey>@<host>/<projectId>. Message, stack and
 * context are redacted first; user ids only, never emails or tokens.
 */
async function sentryCapture(payload: LogPayload): Promise<void> {
  let dsn: URL;
  try { dsn = new URL(process.env.SENTRY_DSN!); } catch { return; }
  const projectId = dsn.pathname.replace(/^\//, "");
  if (!dsn.username || !projectId) return;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: payload.ts,
    platform: "node",
    level: payload.level === "fatal" ? "fatal" : "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    server_name: process.env.VERCEL_REGION,
    message: { formatted: redact(payload.msg) },
    exception: payload.err ? {
      values: [{ type: payload.err.name, value: redact(payload.err.message), stacktrace: undefined }],
    } : undefined,
    extra: {
      ctx: payload.ctx ? JSON.parse(redact(JSON.stringify(payload.ctx))) : undefined,
      stack: payload.err?.stack ? redact(payload.err.stack).slice(0, 8000) : undefined,
    },
    user: payload.ctx?.userId ? { id: String(payload.ctx.userId) } : undefined,
  };
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  await fetch(`${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=aegis/1.0`,
    },
    body: envelope,
    signal: AbortSignal.timeout(3000),
  });
}

function makeLogger(baseCtx: LogContext = {}) {
  function log(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): void {
    if (!shouldLog(level)) return;
    const fullCtx = { ...baseCtx, ...ctx };
    let errPayload: LogPayload["err"];
    if (err instanceof Error) {
      errPayload = { name: err.name, message: err.message, stack: err.stack };
    } else if (err) {
      errPayload = { name: "NonErrorThrow", message: String(err) };
    }
    emit({ level, msg, ts: new Date().toISOString(), ctx: Object.keys(fullCtx).length ? fullCtx : undefined, err: errPayload });
  }

  return {
    debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
    info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
    warn: (msg: string, ctx?: LogContext, err?: unknown) => log("warn", msg, ctx, err),
    error: (msg: string, err?: unknown, ctx?: LogContext) => log("error", msg, ctx, err),
    fatal: (msg: string, err?: unknown, ctx?: LogContext) => log("fatal", msg, ctx, err),
    child: (extraCtx: LogContext) => makeLogger({ ...baseCtx, ...extraCtx }),
  };
}

export const log = makeLogger();
export type Logger = ReturnType<typeof makeLogger>;

/**
 * Wrap a route handler with consistent logging.
 *
 * Example:
 *   export const POST = withRouteLogging("incidents.create", async (req) => { ... });
 */
export function withRouteLogging<TArgs extends unknown[], TRet>(
  name: string,
  handler: (...args: TArgs) => Promise<TRet>,
): (...args: TArgs) => Promise<TRet> {
  return async (...args) => {
    const started = Date.now();
    const childLog = log.child({ route: name });
    try {
      const result = await handler(...args);
      childLog.debug(`route ok`, { durationMs: Date.now() - started });
      return result;
    } catch (err) {
      childLog.error(`route failed`, err, { durationMs: Date.now() - started });
      throw err;
    }
  };
}
