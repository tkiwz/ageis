/**
 * Field-level encryption for sensitive PII.
 *
 * Uses AES-256-GCM with a key derived from ENCRYPTION_KEY env var.
 * Each encrypted blob includes its own IV + auth tag, so two encryptions
 * of the same plaintext produce different ciphertexts (semantically secure).
 *
 * Wire format (base64 of):
 *   [12-byte IV] || [16-byte auth tag] || [ciphertext]
 *
 * Use for fields where:
 *   - The DB might be exfiltrated (defense in depth)
 *   - You don't need to query/filter on the value
 *
 * DO NOT use for:
 *   - Searchable identifiers (email, username) — would break login
 *   - Foreign keys / IDs
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;       // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw =
    process.env.ENCRYPTION_KEY ??
    process.env.NEXTAUTH_SECRET ??
    "";
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY (or NEXTAUTH_SECRET fallback) must be set to use field encryption.",
    );
  }
  // Derive a 32-byte key from whatever we got — supports any input length.
  cachedKey = crypto.createHash("sha256").update(raw).digest();
  return cachedKey;
}

/**
 * Encrypt a UTF-8 string. Returns base64-encoded blob, or empty string if input empty.
 */
export function encryptField(plaintext: string | null | undefined): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted blob.
 * Returns the original plaintext, or null if decryption fails.
 * Empty input returns empty string.
 */
export function decryptField(encoded: string | null | undefined): string | null {
  if (!encoded) return "";
  try {
    const buf = Buffer.from(encoded, "base64");
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ct = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    // Tampering, wrong key, or non-encrypted legacy data — fail safe
    return null;
  }
}

/**
 * "Maybe encrypted" — detect whether a value looks like our wire format.
 * Useful during migration when DBs hold a mix of plain + encrypted fields.
 */
export function isLikelyEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.length < 40) return false; // min size: 12 + 16 = 28 bytes ≈ 38 base64 chars
  // Base64 alphabet only
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Best-effort decrypt — returns plaintext for encrypted values,
 * or the original value for legacy plaintext. Useful in reads.
 */
export function decryptOrPassthrough(value: string | null | undefined): string {
  if (!value) return "";
  if (!isLikelyEncrypted(value)) return value;
  const decrypted = decryptField(value);
  return decrypted ?? value;
}

/**
 * Deterministic hash — for indexing encrypted values without revealing content.
 * Use when you need to "search" an encrypted column by exact match.
 * Returns hex (no salt — same input always produces same hash).
 */
export function deterministicHash(plaintext: string): string {
  return crypto.createHmac("sha256", getKey()).update(plaintext).digest("hex");
}
