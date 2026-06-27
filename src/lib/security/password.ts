/**
 * Password policy + strength scoring.
 *
 * Rules (configurable via PASSWORD_MIN_LEN env):
 *   - Min length 12 (configurable)
 *   - At least 3 of: uppercase, lowercase, digit, symbol
 *   - Not in the common-password list
 *   - Not equal to email / name
 *   - Max 128 chars (prevents DoS via bcrypt input)
 *
 * Returns a structured result with a 0-100 strength score and reasons.
 */

const MIN_LENGTH = Number(process.env.PASSWORD_MIN_LEN ?? 12);
const MAX_LENGTH = 128;

// Top-1000 most common passwords condensed — full list at SECPATH
const COMMON = new Set<string>([
  "password", "password1", "password123", "passw0rd", "p@ssw0rd",
  "qwerty", "qwerty123", "qwertyui", "asdfgh", "zxcvbn",
  "123456", "123456789", "12345678", "1234567890", "111111", "112233", "000000",
  "abc123", "abcd1234", "letmein", "welcome", "welcome1", "monkey",
  "admin", "admin123", "administrator", "root", "toor",
  "iloveyou", "princess", "dragon", "sunshine", "shadow",
  "master", "trustno1", "starwars", "michael", "football",
  "aegis", "aegis123", "demo", "test", "test123",
]);

export interface PasswordCheckResult {
  ok: boolean;
  score: number;            // 0-100
  strength: "very-weak" | "weak" | "fair" | "strong" | "very-strong";
  reasons: string[];        // why it failed (empty if ok)
  reasonsAr: string[];
}

export function checkPasswordStrength(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordCheckResult {
  const reasons: string[] = [];
  const reasonsAr: string[] = [];

  if (!password || password.length < MIN_LENGTH) {
    reasons.push(`Password must be at least ${MIN_LENGTH} characters.`);
    reasonsAr.push(`كلمة السر يجب أن تكون ${MIN_LENGTH} حرفاً على الأقل.`);
  }
  if (password.length > MAX_LENGTH) {
    reasons.push(`Password too long (max ${MAX_LENGTH}).`);
    reasonsAr.push(`كلمة السر طويلة جداً (الحد الأقصى ${MAX_LENGTH}).`);
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 3) {
    reasons.push("Password must contain at least 3 of: uppercase, lowercase, digit, symbol.");
    reasonsAr.push("يجب أن تحتوي كلمة السر على 3 من: حرف كبير، حرف صغير، رقم، رمز.");
  }

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    reasons.push("That password is too common — pick something unique.");
    reasonsAr.push("كلمة السر هذه شائعة جداً — اختر شيئاً فريداً.");
  }

  if (context.email && lower.includes(context.email.toLowerCase().split("@")[0])) {
    reasons.push("Password must not contain your email.");
    reasonsAr.push("يجب ألا تحتوي كلمة السر على بريدك.");
  }
  if (context.name && context.name.length > 2 && lower.includes(context.name.toLowerCase())) {
    reasons.push("Password must not contain your name.");
    reasonsAr.push("يجب ألا تحتوي كلمة السر على اسمك.");
  }

  // Repeating chars (e.g. "aaaaaaaa" or "111111")
  if (/(.)\1{5,}/.test(password)) {
    reasons.push("Password has too many repeated characters.");
    reasonsAr.push("كلمة السر تحتوي على تكرار مفرط.");
  }

  // Score: length, classes, uniqueness
  let score = 0;
  score += Math.min(40, password.length * 3);
  score += classes * 10;
  score += new Set(password).size * 1.5;
  score = Math.min(100, Math.round(score));

  const strength =
    score < 30 ? "very-weak" :
    score < 50 ? "weak" :
    score < 70 ? "fair" :
    score < 85 ? "strong" :
    "very-strong";

  return { ok: reasons.length === 0, score, strength, reasons, reasonsAr };
}

/**
 * Throws if password fails policy. Use in API routes that create/update passwords.
 */
export function assertPasswordPolicy(password: string, context: { email?: string; name?: string } = {}): void {
  const result = checkPasswordStrength(password, context);
  if (!result.ok) {
    throw new Error(result.reasons.join(" "));
  }
}
