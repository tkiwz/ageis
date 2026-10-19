import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createT } from "./translate";
import { en } from "./messages/en";
import { ar } from "./messages/ar";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function getMessages(locale: Locale) {
  return locale === "ar" ? ar : en;
}

/** Server components: const t = await getT(); */
export async function getT() {
  const locale = await getLocale();
  return Object.assign(createT(getMessages(locale)), { locale });
}
