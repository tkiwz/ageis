import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { whatsappSchema, zodMessage } from "@/lib/validations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const phone  = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_APIKEY;

  if (!phone || !apiKey) {
    return fail(
      "NOT_CONFIGURED",
      "CALLMEBOT_PHONE and CALLMEBOT_APIKEY missing from .env",
      503,
    );
  }

  let body: { message: string };
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  const parsed = whatsappSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
  body = parsed.data;

  const url =
    `https://api.callmebot.com/whatsapp.php` +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(body.message)}` +
    `&apikey=${apiKey}`;

  try {
    const res  = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    if (!res.ok) {
      console.error("[whatsapp notify]", res.status, text);
      return fail("CALLMEBOT_ERROR", `CallMeBot: ${res.status}`, 502);
    }

    console.log("[whatsapp notify] sent ✓");
    return ok({ sent: true });
  } catch (err) {
    return fail("FETCH_ERROR", "Request failed. Try again later.", 500);
  }
}