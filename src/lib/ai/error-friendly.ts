/**
 * Convert raw Anthropic / OpenAI / Gemini SDK errors into user-friendly
 * messages. Use whenever an AI call might surface its error to the UI.
 */

interface FriendlyError {
  code: "BUDGET_EXHAUSTED" | "RATE_LIMITED" | "AUTH" | "INVALID" | "TIMEOUT" | "UNKNOWN";
  message: string;
  messageAr: string;
  httpStatus: number;
  // True when the user / admin can do something about it (top up, wait, etc.)
  actionable: boolean;
}

const SPENDING_LIMIT_PATTERNS = [
  /spending limit/i,
  /spend limit/i,
  /usage limit/i,
  /credit balance/i,
  /quota exceeded/i,
  /billing/i,
];

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /429/,
];

const AUTH_PATTERNS = [
  /invalid api key/i,
  /authentication/i,
  /unauthorized/i,
  /401/,
];

export function friendlyClaudeError(err: unknown): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);

  // Try to parse Anthropic SDK errors that come as JSON-in-string
  let parsed: { error?: { type?: string; message?: string } } = {};
  try {
    // Anthropic errors are often: `400 {"type":"error","error":{...}}`
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch { /* swallow */ }

  const innerMessage = parsed.error?.message ?? raw;

  if (SPENDING_LIMIT_PATTERNS.some((re) => re.test(innerMessage))) {
    return {
      code: "BUDGET_EXHAUSTED",
      message: "AI service unavailable — provider spending limit reached. Contact your administrator.",
      messageAr: "خدمة الذكاء الاصطناعي غير متاحة — تم الوصول إلى حد الصرف لدى مزوّد الخدمة. تواصل مع المسؤول.",
      httpStatus: 503,
      actionable: true,
    };
  }
  if (RATE_LIMIT_PATTERNS.some((re) => re.test(innerMessage))) {
    return {
      code: "RATE_LIMITED",
      message: "AI temporarily rate-limited. Please try again in a few seconds.",
      messageAr: "الذكاء الاصطناعي مزدحم مؤقتاً، جرّب بعد ثوانٍ.",
      httpStatus: 429,
      actionable: false,
    };
  }
  if (AUTH_PATTERNS.some((re) => re.test(innerMessage))) {
    return {
      code: "AUTH",
      message: "AI authentication failed. Administrator needs to check API key.",
      messageAr: "فشل في مصادقة AI. يحتاج المسؤول لمراجعة مفتاح الـ API.",
      httpStatus: 503,
      actionable: true,
    };
  }
  if (/timeout|ETIMEDOUT|aborted/i.test(innerMessage)) {
    return {
      code: "TIMEOUT",
      message: "AI request timed out. Try again.",
      messageAr: "انتهت مهلة طلب AI. حاول مجدداً.",
      httpStatus: 504,
      actionable: false,
    };
  }
  if (/invalid|400|bad request/i.test(innerMessage)) {
    return {
      code: "INVALID",
      message: "AI request was rejected. Please rephrase or try a different command.",
      messageAr: "تم رفض الطلب. حاول صياغته بطريقة مختلفة.",
      httpStatus: 400,
      actionable: false,
    };
  }

  return {
    code: "UNKNOWN",
    message: "AI service unavailable right now.",
    messageAr: "خدمة AI غير متاحة حالياً.",
    httpStatus: 500,
    actionable: false,
  };
}
