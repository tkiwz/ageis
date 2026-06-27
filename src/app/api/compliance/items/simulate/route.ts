import { NextResponse } from "next/server";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";
import { auth }         from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_TAG = "[SIM-CI]";

function daysFromNow(n: number) { return new Date(Date.now() + n * 864e5); }
function daysAgo(n: number)     { return new Date(Date.now() - n * 864e5); }

const SAMPLES = [
  { title: `${SIM_TAG} ISO 45001 Internal Audit — Annual`,            reg: "ISO 45001 §9.2",      due: daysFromNow(30),   status: "PENDING",   lock: false },
  { title: `${SIM_TAG} MoEM HSE Annual Return Submission`,            reg: "MoEM Reg. §12",       due: daysFromNow(60),   status: "PENDING",   lock: true  },
  { title: `${SIM_TAG} PDPL Data Retention Policy Review`,            reg: "PDPL Art. 9",         due: daysFromNow(90),   status: "PENDING",   lock: false },
  { title: `${SIM_TAG} Fire Safety Certificate Renewal`,              reg: "NFPA 101 §18",        due: daysFromNow(15),   status: "PENDING",   lock: false },
  { title: `${SIM_TAG} Gas Detector Calibration — Monthly`,           reg: "ISO 45001 §8.1.2",    due: daysFromNow(5),    status: "PENDING",   lock: false },
  { title: `${SIM_TAG} Emergency Response Plan Annual Review`,        reg: "MoEM Circular 4/2022",due: daysFromNow(120),  status: "COMPLIANT", lock: false },
  { title: `${SIM_TAG} Hot Work Permit System Audit`,                 reg: "OSHAS 18001 §4.3.1",  due: daysFromNow(45),   status: "COMPLIANT", lock: false },
  { title: `${SIM_TAG} Worker Medical Fitness Certificates`,          reg: "Labour Law Art. 65",  due: daysFromNow(200),  status: "COMPLIANT", lock: false },
  { title: `${SIM_TAG} H2S Safety Training — All Personnel`,         reg: "ISO 45001 §7.2",      due: daysAgo(10),       status: "OVERDUE",   lock: false },
  { title: `${SIM_TAG} Environmental Impact Assessment Update`,       reg: "RD 114/2001",         due: daysAgo(45),       status: "OVERDUE",   lock: true  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const site      = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  const responsible = await db.user.findFirst({ where: { role: { in: ["ADMIN", "HSSE_MANAGER"] } }, orderBy: { createdAt: "asc" } });
  if (!site || !responsible) return fail("NO_DATA", "No site or users found.", 500) as unknown as Response;

  await db.complianceItem.deleteMany({ where: { title: { startsWith: SIM_TAG } } });

  let created = 0;
  for (const s of SAMPLES) {
    await db.complianceItem.create({
      data: {
        title:            s.title,
        regulationRef:    s.reg,
        status:           s.status,
        dueDate:          s.due,
        triggersLockdown: s.lock,
        siteId:           site.id,
        responsibleId:    responsible.id,
      },
    });
    created++;
  }
  return ok({ created });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;
  const { count } = await db.complianceItem.deleteMany({ where: { title: { startsWith: SIM_TAG } } });
  return ok({ deleted: count });
}
