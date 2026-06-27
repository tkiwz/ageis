import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

/** Successful API response */
export function ok<T>(data: T, meta?: ApiResponse<T>["meta"]) {
  const response: ApiResponse<T> = { ok: true, data, meta };
  return NextResponse.json(response);
}

/** Error API response */
export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  const response: ApiResponse<never> = {
    ok: false,
    error: { code, message, details },
  };
  return NextResponse.json(response, { status });
}

/** Common error helpers */
export const unauthorized = (msg = "Authentication required") =>
  fail("UNAUTHORIZED", msg, 401);

export const forbidden = (msg = "Permission denied") =>
  fail("FORBIDDEN", msg, 403);

export const notFound = (msg = "Resource not found") =>
  fail("NOT_FOUND", msg, 404);

export const serverError = (msg = "Internal server error") =>
  fail("SERVER_ERROR", msg, 500);