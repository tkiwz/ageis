/**
 * Browser security helpers — getUserMedia / SpeechRecognition / etc.
 * require a "secure context" which means:
 *   - HTTPS (any hostname), OR
 *   - http://localhost / http://127.0.0.1 / file:// (browser exception)
 *
 * On a LAN IP like http://172.20.10.2:3000 the page is NOT secure, so the
 * microphone is blocked. This module surfaces that condition so the UI can
 * explain it instead of just failing silently.
 */

export interface SecureContextStatus {
  secure: boolean;
  reason?: "http-on-lan" | "file" | "insecure";
  host: string;
  protocol: string;
  suggestion: string;
  suggestionAr: string;
}

export function getSecureContextStatus(): SecureContextStatus {
  if (typeof window === "undefined") {
    return {
      secure: true, host: "ssr", protocol: "ssr",
      suggestion: "", suggestionAr: "",
    };
  }
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  // Browsers expose `isSecureContext` as the source of truth.
  // Fall back to a manual check if missing.
  const isSecure =
    typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : (protocol === "https:" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost"));

  if (isSecure) {
    return { secure: true, host, protocol, suggestion: "", suggestionAr: "" };
  }

  // It's HTTP on a LAN IP — explain and suggest workaround
  return {
    secure: false,
    reason: protocol === "file:" ? "file" : "http-on-lan",
    host,
    protocol,
    suggestion: `Microphone is blocked because this page is served over insecure HTTP.\n\nQuick fixes:\n  1. Open http://localhost:3000 on the host machine (mic works there).\n  2. Or run "npm run dev:https" to start with HTTPS — then open https://${host}:3000 and accept the self-signed certificate warning.`,
    suggestionAr: `الميكروفون محظور لأن الصفحة تُقدَّم عبر HTTP غير آمن.\n\nالحلول السريعة:\n  1. افتح http://localhost:3000 على نفس الجهاز.\n  2. أو شغّل "npm run dev:https" لتشغيل الخادم مع HTTPS — ثم افتح https://${host}:3000 واقبل تحذير الشهادة.`,
  };
}

export function isSecureContext(): boolean {
  return getSecureContextStatus().secure;
}
