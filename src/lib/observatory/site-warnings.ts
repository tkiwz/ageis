/**
 * Early warning for AEGIS sites: the observatory's governorate warnings for the
 * next 72 hours, matched to each site and to the permits whose work is exposed
 * to that hazard (cranes in wind, excavations in rain, …).
 */
import { db } from "@/lib/db";
import { getForecastGrid } from "./grid";
import { computeWarnings, governorateOf, FEATURES, type Hazard, type Level, type Warning } from "./warnings";

const HORIZON_MS = 72 * 3600_000;
/** Permits still ahead or under way — reviewers should see the weather too. */
const LIVE_PERMIT = ["SUBMITTED", "PENDING", "IN_REVIEW", "APPROVED", "ACTIVE"];

/** Which work types each hazard puts at risk. */
export const EXPOSED: Record<Hazard, string[]> = {
  WIND: ["LIFTING", "HEIGHT_WORK"],
  RAIN: ["EXCAVATION", "CONFINED_SPACE", "ELECTRICAL"],
  STORM: ["LIFTING", "HEIGHT_WORK", "ELECTRICAL", "EXCAVATION", "CONFINED_SPACE"],
  HEAT: ["HOT_WORK", "CONFINED_SPACE", "HEIGHT_WORK"],
  FOG: ["LIFTING"],
};

export interface ExposedPermit { id: string; permitNumber: string; title: string; type: string; status: string }
export interface SiteWarning extends Warning { permits: ExposedPermit[] }
export interface SiteWarnings {
  site: { id: string; code: string; name: string; nameAr: string | null };
  iso: string;
  governorate: { name: string; nameAr: string };
  warnings: SiteWarning[];
}

const GOV = Object.fromEntries(FEATURES.map((f) => [f.properties.iso, f.properties]));

/** Sites (optionally limited to `siteIds`) with any warning in the next 72 h, worst first. */
export async function getSiteWarnings(siteIds: string[] | "*"): Promise<{ generatedAt: string; sites: SiteWarnings[] }> {
  const grid = await getForecastGrid();
  const { warnings, generatedAt } = computeWarnings(grid);
  const now = Date.now();
  const upcoming = warnings.filter((w) => Date.parse(w.to) > now && Date.parse(w.from) < now + HORIZON_MS);
  if (!upcoming.length) return { generatedAt, sites: [] };

  const sites = await db.site.findMany({
    where: { status: "ACTIVE", ...(siteIds === "*" ? {} : { id: { in: siteIds } }) },
    select: { id: true, code: true, name: true, nameAr: true, latitude: true, longitude: true },
  });
  const bySite = sites
    .map((s) => ({ s, iso: governorateOf(s.latitude, s.longitude) }))
    .filter((x): x is { s: (typeof sites)[number]; iso: string } => !!x.iso && upcoming.some((w) => w.iso === x.iso));
  if (!bySite.length) return { generatedAt, sites: [] };

  const permits = await db.permit.findMany({
    where: {
      siteId: { in: bySite.map((x) => x.s.id) },
      status: { in: LIVE_PERMIT },
      validUntil: { gte: new Date(now) },
      validFrom: { lte: new Date(now + HORIZON_MS) },
    },
    select: { id: true, permitNumber: true, title: true, type: true, status: true, siteId: true, validFrom: true, validUntil: true },
  });

  const result: SiteWarnings[] = bySite.map(({ s, iso }) => ({
    site: { id: s.id, code: s.code, name: s.name, nameAr: s.nameAr },
    iso,
    governorate: { name: GOV[iso].name, nameAr: GOV[iso].nameAr },
    warnings: upcoming
      .filter((w) => w.iso === iso)
      .map((w) => ({
        ...w,
        permits: permits
          .filter((p) => p.siteId === s.id && EXPOSED[w.hazard].includes(p.type)
            && p.validFrom.getTime() < Date.parse(w.to) && p.validUntil.getTime() > Date.parse(w.from))
          .map(({ id, permitNumber, title, type, status }) => ({ id, permitNumber, title, type, status })),
      }))
      .sort((a, b) => b.level - a.level || a.from.localeCompare(b.from)),
  }));
  result.sort((a, b) => Math.max(...b.warnings.map((w) => w.level)) - Math.max(...a.warnings.map((w) => w.level)) || a.site.code.localeCompare(b.site.code));
  return { generatedAt, sites: result };
}

// ── Dashboard alerts ────────────────────────────────────────
const HAZARD_AR: Record<Hazard, string> = { RAIN: "أمطار وجريان أودية", WIND: "رياح قوية", STORM: "عواصف رعدية", HEAT: "حرارة شديدة", FOG: "ضباب" };
const LEVEL_AR: Record<Level, string> = { 0: "", 1: "أصفر", 2: "برتقالي", 3: "أحمر" };
const ALERT_TYPE: Record<Level, string> = { 0: "INFO", 1: "WARNING", 2: "WARNING", 3: "CRITICAL" };
const omanTime = (iso: string) =>
  new Intl.DateTimeFormat("ar-OM", { timeZone: "Asia/Muscat", weekday: "long", hour: "numeric" }).format(new Date(iso));

let lastSync = 0;

/**
 * Raises one dashboard alert per site + hazard + day for orange / red warnings,
 * and for yellow ones that touch an open permit. At most every 30 min per instance.
 */
export async function syncForecastAlerts(): Promise<void> {
  if (Date.now() - lastSync < 30 * 60_000) return;
  lastSync = Date.now();
  const { sites } = await getSiteWarnings("*");
  for (const sw of sites) {
    for (const w of sw.warnings) {
      if (w.level < 2 && w.permits.length === 0) continue;
      const title = `إنذار ${LEVEL_AR[w.level]}: ${HAZARD_AR[w.hazard]} — ${sw.site.nameAr ?? sw.site.name} (${w.day})`;
      const exists = await db.alert.findFirst({ where: { siteId: sw.site.id, title }, select: { id: true } });
      if (exists) continue;
      const permitsLine = w.permits.length
        ? ` التصاريح المتأثرة: ${w.permits.map((p) => p.permitNumber).join("، ")}.`
        : "";
      await db.alert.create({
        data: {
          type: ALERT_TYPE[w.level],
          title,
          message: `متوقع من ${omanTime(w.from)} إلى ${omanTime(w.to)} في ${sw.governorate.nameAr}.${permitsLine} (مرصد AEGIS)`,
          siteId: sw.site.id,
          channels: JSON.stringify(["DASHBOARD"]),
          status: "ACTIVE",
          isAutonomous: true,
        },
      });
    }
  }
}
