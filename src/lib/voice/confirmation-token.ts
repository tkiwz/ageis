/**
 * HMAC-signed confirmation tokens for sensitive voice actions.
 *
 * Why: a user saying "lockdown site BLOCK_60 confirmed" in a single transcript
 * could be a prompt-injection attempt. Real confirmation requires a SEPARATE
 * turn — the server issues a short-lived signed token on the first turn, and
 * only accepts the action when the same token is presented back from the
 * client on a second turn.
 *
 * The token is unforgeable without the server's NEXTAUTH_SECRET, and it
 * encodes (userId, actionName, paramsHash, expiry).
 */
import crypto from "crypto";

const TOKEN_TTL_MS = 60 * 1000; // 60 seconds — short window forces a real second turn

function getKey(): string {
  return process.env.NEXTAUTH_SECRET ?? "dev-key-not-for-production";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getKey()).update(payload).digest("base64url");
}

interface TokenPayload {
  userId: string;
  actionName: string;
  paramsHash: string;
  exp: number; // ms epoch
}

function hashParams(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(params));
  return crypto.createHash("sha256").update(canonical).digest("base64url").slice(0, 16);
}

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === "object") {
    return Object.keys(obj as object).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortKeys((obj as Record<string, unknown>)[k]);
      return acc;
    }, {});
  }
  return obj;
}

export function issueConfirmationToken(
  userId: string,
  actionName: string,
  params: Record<string, unknown>,
): string {
  const payload: TokenPayload = {
    userId,
    actionName,
    paramsHash: hashParams(params),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export interface VerifiedToken {
  valid: boolean;
  reason?: string;
  payload?: TokenPayload;
}

export function verifyConfirmationToken(
  token: string,
  userId: string,
  actionName: string,
  params: Record<string, unknown>,
): VerifiedToken {
  if (!token || !token.includes(".")) {
    return { valid: false, reason: "Malformed token" };
  }
  const [body, sig] = token.split(".");
  const expected = sign(body);
  // Constant-time compare
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { valid: false, reason: "Bad signature" };
  }
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "Bad payload encoding" };
  }
  if (payload.exp < Date.now()) return { valid: false, reason: "Expired" };
  if (payload.userId !== userId) return { valid: false, reason: "User mismatch" };
  if (payload.actionName !== actionName) return { valid: false, reason: "Action mismatch" };
  if (payload.paramsHash !== hashParams(params)) {
    return { valid: false, reason: "Params changed since token issue" };
  }
  return { valid: true, payload };
}
