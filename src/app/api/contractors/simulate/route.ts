/**
 * POST /api/contractors/simulate  — create Gulf region contractor companies
 * DELETE /api/contractors/simulate — remove them
 */

import { NextResponse } from "next/server";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";
import { auth }         from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_TAG = "[SIM-CO]";

// Real Gulf region HSSE / oil & gas contractors with realistic data
const GULF_COMPANIES = [
  {
    name:          `${SIM_TAG} Arabian Drilling Company`,
    companyName:   "Arabian Drilling Company — ADC",
    contactEmail:  "hsse@arabiandrilling.com.sa",
    contactPhone:  "+966-13-847-5000",
    safetyRating:  4.7,
    status:        "ACTIVE",
    country:       "Saudi Arabia",
    specialty:     "Land & offshore drilling — ARAMCO approved",
    contractStart: daysAgo(365),
    contractEnd:   daysAhead(365),
  },
  {
    name:          `${SIM_TAG} Galfar Engineering & Contracting`,
    companyName:   "Galfar Engineering & Contracting SAOG",
    contactEmail:  "safety@galfar.com",
    contactPhone:  "+968-2456-5000",
    safetyRating:  4.5,
    status:        "ACTIVE",
    country:       "Oman",
    specialty:     "Civil, mechanical & pipeline construction",
    contractStart: daysAgo(180),
    contractEnd:   daysAhead(540),
  },
  {
    name:          `${SIM_TAG} NPCC — National Petroleum Construction Company`,
    companyName:   "National Petroleum Construction Company PJSC",
    contactEmail:  "hsse@npcc.ae",
    contactPhone:  "+971-2-673-3000",
    safetyRating:  4.8,
    status:        "ACTIVE",
    country:       "UAE (Abu Dhabi)",
    specialty:     "Offshore pipeline & platform installation",
    contractStart: daysAgo(90),
    contractEnd:   daysAhead(730),
  },
  {
    name:          `${SIM_TAG} Petrofac Facilities Management`,
    companyName:   "Petrofac Facilities Management Ltd.",
    contactEmail:  "hse@petrofac.com",
    contactPhone:  "+971-4-408-0000",
    safetyRating:  4.2,
    status:        "ACTIVE",
    country:       "UAE (Dubai)",
    specialty:     "Operations & maintenance — O&M services",
    contractStart: daysAgo(60),
    contractEnd:   daysAhead(300),
  },
  {
    name:          `${SIM_TAG} Lamprell Energy`,
    companyName:   "Lamprell Energy Ltd.",
    contactEmail:  "safety@lamprell.com",
    contactPhone:  "+971-6-545-0000",
    safetyRating:  4.3,
    status:        "ACTIVE",
    country:       "UAE (Sharjah)",
    specialty:     "Fabrication, rig upgrades & newbuild",
    contractStart: daysAgo(200),
    contractEnd:   daysAhead(160),
  },
  {
    name:          `${SIM_TAG} CCC — Consolidated Contractors Company`,
    companyName:   "Consolidated Contractors Company SRL",
    contactEmail:  "hsse@ccc.gr",
    contactPhone:  "+966-11-488-9000",
    safetyRating:  3.9,
    status:        "ACTIVE",
    country:       "Regional (KSA)",
    specialty:     "EPC — pipelines, plants, and infrastructure",
    contractStart: daysAgo(400),
    contractEnd:   daysAhead(200),
  },
  {
    name:          `${SIM_TAG} Gulf Spic Industrial Services`,
    companyName:   "Gulf Spic General Trading & Contracting Co.",
    contactEmail:  "ops@gulfspic.com.kw",
    contactPhone:  "+965-2477-0000",
    safetyRating:  3.5,
    status:        "SUSPENDED",
    country:       "Kuwait",
    specialty:     "Industrial cleaning & shutdown maintenance",
    contractStart: daysAgo(500),
    contractEnd:   daysAhead(60),
  },
  {
    name:          `${SIM_TAG} Al Nasr Contracting Company`,
    companyName:   "Al Nasr National Contracting Company LLC",
    contactEmail:  "safety@alnasr-ncc.ae",
    contactPhone:  "+971-2-555-0012",
    safetyRating:  2.8,
    status:        "SUSPENDED",
    country:       "UAE (Abu Dhabi)",
    specialty:     "Civil works & infrastructure",
    contractStart: daysAgo(700),
    contractEnd:   daysAgo(30),
  },
  {
    name:          `${SIM_TAG} Target Engineering Construction Co.`,
    companyName:   "Target Engineering Construction Company LLC",
    contactEmail:  "hsse@targetengineering.ae",
    contactPhone:  "+971-2-673-4800",
    safetyRating:  4.6,
    status:        "ACTIVE",
    country:       "UAE (Abu Dhabi)",
    specialty:     "Offshore construction & subsea works",
    contractStart: daysAgo(120),
    contractEnd:   daysAhead(880),
  },
  {
    name:          `${SIM_TAG} Archirodon Construction`,
    companyName:   "Archirodon Construction (Overseas) Co. S.A.",
    contactEmail:  "safety@archirodon.net",
    contactPhone:  "+973-1753-0000",
    safetyRating:  4.1,
    status:        "EXPIRED",
    country:       "Bahrain",
    specialty:     "Marine, civil & dredging",
    contractStart: daysAgo(730),
    contractEnd:   daysAgo(10),
  },
];

function daysAgo(n: number): Date  { return new Date(Date.now() - n * 864e5); }
function daysAhead(n: number): Date { return new Date(Date.now() + n * 864e5); }

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  // Remove previous sim records
  await db.contractor.deleteMany({ where: { name: { startsWith: SIM_TAG } } });

  let created = 0;
  for (const c of GULF_COMPANIES) {
    await db.contractor.create({
      data: {
        name:          c.name,
        companyName:   c.companyName,
        contactEmail:  c.contactEmail,
        contactPhone:  c.contactPhone,
        safetyRating:  c.safetyRating,
        status:        c.status,
        contractStart: c.contractStart,
        contractEnd:   c.contractEnd,
      },
    });
    created++;
  }

  return ok({ created, message: `${created} Gulf contractor companies added.` });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const { count } = await db.contractor.deleteMany({ where: { name: { startsWith: SIM_TAG } } });
  return ok({ deleted: count });
}
