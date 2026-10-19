import type { Messages } from "./messages/en";
import { TIME_ZONE, intlTag, type Locale } from "./config";
import type { EnumMessages } from "./messages/en/enums";

/** "a.b.c" keys for every string leaf in the dictionary. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

export function createT(messages: Messages): TFunction {
  return (key, vars) => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
    let text = typeof node === "string" ? node : key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}

export function formatDate(d: Date | string | number, locale: Locale, opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlTag(locale), { timeZone: TIME_ZONE, ...(opts ?? { dateStyle: "medium" }) }).format(new Date(d));
}

export function formatTime(d: Date | string | number, locale: Locale) {
  return formatDate(d, locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "2 min ago" / "قبل دقيقتين" — render after mount to avoid hydration drift. */
export function formatRelative(d: Date | string | number, locale: Locale, now: number = Date.now()) {
  const diff = (new Date(d).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d, locale);
}

export function formatDateTime(d: Date | string | number, locale: Locale) {
  return formatDate(d, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(n: number, locale: Locale, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(intlTag(locale), opts).format(n);
}

/** Pick the Arabic/English field of a DB row, e.g. pickLocalized(site, "name", locale). */
export function pickLocalized<T extends Record<string, unknown>>(row: T, field: string, locale: Locale): string {
  const ar = row[`${field}Ar`];
  return locale === "ar" && typeof ar === "string" && ar ? ar : String(row[field] ?? "");
}

type EnumGroup = keyof EnumMessages;

/** Label for a stored enum value: tEnum(t, "status", row.status). Unknown values are humanised. */
export function tEnum(t: TFunction, group: EnumGroup, value: string | null | undefined): string {
  if (!value) return "";
  const key = `enums.${group}.${value}` as MessageKey;
  const label = t(key);
  return label === key ? value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : label;
}
