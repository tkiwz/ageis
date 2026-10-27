/** Shared shapes for the cyclone view (client side). */
export interface HistoricStorm {
  sid: string;
  name: string | null;
  nameAr: string | null;
  year: number;
  start: string;
  end: string;
  peakKt: number | null;
  peakCat: "TD" | "TS" | "HU";
  closestKm: number;
  landfall: string | null;
  near: string[];
  /** [lon, lat, category] every 6 hours */
  track: [number, number, string][];
}

/** Category colours (same as the map's CAT_COLOR). */
export const CAT_COLOR_UI: Record<string, string> = { TD: "#7fb0dc", TS: "#e3c14f", HU: "#c8463d" };
