/** WMO weather code → condition key (translated in enums.weatherCondition). Pure, safe on the client. */
export function conditionFromCode(code: number): string {
  if (code === 0) return "CLEAR";
  if (code <= 2) return "PARTLY_CLOUDY";
  if (code === 3) return "CLOUDY";
  if (code === 45 || code === 48) return "FOG";
  if (code >= 51 && code <= 57) return "DRIZZLE";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "RAIN";
  if (code >= 95) return "THUNDERSTORM";
  return "CLOUDY";
}
