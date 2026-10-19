/**
 * Shared-secret auth for field devices (ESP32, Raspberry Pi, wearables).
 * Devices send DEVICE_INGEST_SECRET in one of the accepted headers.
 * Fails closed in production when the secret is not configured.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const HEADERS = ["x-device-secret", "x-device-key"];

export function verifyDeviceSecret(req: NextRequest): boolean {
  const secret = process.env.DEVICE_INGEST_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const provided = HEADERS.map((h) => req.headers.get(h)).find(Boolean);
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
