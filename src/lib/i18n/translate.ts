import type { Messages } from "./messages/en";
import { intlTag, type Locale } from "./config";

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
  return new Intl.DateTimeFormat(intlTag(locale), opts ?? { dateStyle: "medium" }).format(new Date(d));
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
