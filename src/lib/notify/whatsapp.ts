/**
 * WhatsApp via CallMeBot (env CALLMEBOT_PHONE, CALLMEBOT_APIKEY).
 * CALLMEBOT_PHONE may hold several numbers separated by commas; each number
 * needs its own key in CALLMEBOT_APIKEY (same order) — or one key for all.
 * Best-effort: never throws, returns how many messages were accepted.
 */
export function whatsappConfigured(): boolean {
  return Boolean(process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY);
}

export async function sendWhatsApp(message: string): Promise<number> {
  if (!whatsappConfigured()) return 0;
  const phones = process.env.CALLMEBOT_PHONE!.split(",").map((p) => p.trim()).filter(Boolean);
  const keys = process.env.CALLMEBOT_APIKEY!.split(",").map((k) => k.trim());
  const text = message.slice(0, 1500);

  const results = await Promise.allSettled(
    phones.map((phone, i) =>
      fetch(
        `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(keys[i] ?? keys[0])}`,
        { cache: "no-store", signal: AbortSignal.timeout(15_000) },
      ).then((r) => r.ok),
    ),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}
