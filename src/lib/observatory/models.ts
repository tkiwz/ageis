/**
 * The global models the observatory blends. Rain is the mean of the models that
 * have data (weights come from calibration once it has enough observations),
 * and "agreement" is how many of them expect rain at that place and time.
 */
export const MODELS = [
  { id: "ecmwf_ifs025", name: "ECMWF IFS", org: "European Centre (ECMWF)", orgAr: "المركز الأوروبي ECMWF" },
  { id: "ecmwf_aifs025_single", name: "ECMWF AIFS", org: "ECMWF, AI model", orgAr: "نموذج الذكاء الاصطناعي الأوروبي" },
  { id: "ukmo_seamless", name: "UK Met Office", org: "UK Met Office", orgAr: "الأرصاد البريطانية" },
  { id: "icon_seamless", name: "DWD ICON", org: "German Weather Service", orgAr: "الأرصاد الألمانية" },
  { id: "gfs_seamless", name: "NOAA GFS", org: "US NOAA", orgAr: "الأرصاد الأمريكية NOAA" },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

/** Rain that counts as "this model expects rain" (mm in 3 h). */
export const AGREE_MM = 0.5;

/** Weighted mean over the models that have a value; null when none do. */
export function blend(values: (number | null)[], weights: number[]): number | null {
  let s = 0, w = 0;
  values.forEach((v, k) => { if (v !== null && Number.isFinite(v)) { s += v * weights[k]; w += weights[k]; } });
  return w > 0 ? s / w : null;
}
