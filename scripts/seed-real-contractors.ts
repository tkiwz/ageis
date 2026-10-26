/**
 * Loads real Omani oil & gas contractor companies into the contractor registry.
 *
 *   npx tsx scripts/seed-real-contractors.ts            # dry run
 *   npx tsx scripts/seed-real-contractors.ts --apply    # insert / refresh
 *
 * Only public facts are stored: legal name, what the company does, website, and
 * where that came from. Contracts with *your* organisation, contact people and
 * safety ratings are not public, so every company starts as PREQUALIFICATION with
 * no rating; HSSE fills those in from the app after prequalification.
 * Re-running is safe: rows are matched by company name and only the public
 * fields are refreshed (status, rating, dates and contacts set in the app are kept).
 */
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/security/audit-chain";

const APPLY = process.argv.includes("--apply");

type Seed = { name: string; nameAr: string; companyName: string; specialty: string; specialtyAr: string; website: string | null; source: string };
const CONTRACTORS: Seed[] = [
  {
    name: "Galfar", nameAr: "جلفار للهندسة والمقاولات",
    companyName: "Galfar Engineering & Contracting SAOG",
    specialty: "Oil & gas EPC, pipelines and construction; long-standing PDO contractor (5-year Qarn Alam project delivery contract, 2024).",
    specialtyAr: "مقاولات هندسية (EPC) للنفط والغاز وخطوط الأنابيب والإنشاءات؛ مقاول قديم لدى تنمية نفط عُمان (عقد تنفيذ مشروع قرن علم لخمس سنوات، 2024).",
    website: "https://galfar.com",
    source: "galfar.com; Oman Observer (Feb 2024); Wikipedia",
  },
  {
    name: "Abraj Energy Services", nameAr: "أبراج لخدمات الطاقة",
    companyName: "Abraj Energy Services",
    specialty: "Onshore drilling, workover, well testing, cementing, fracturing and coiled tubing; OQ group company.",
    specialtyAr: "حفر بري، صيانة الآبار، اختبار الآبار، التسميت، التكسير الهيدروليكي والأنابيب الملفوفة؛ من مجموعة أوكيو.",
    website: "https://abrajenergy.com",
    source: "abrajenergy.com; AGBI",
  },
  {
    name: "MB Petroleum Services", nameAr: "إم بي لخدمات البترول",
    companyName: "MB Petroleum Services LLC",
    specialty: "Drilling, workover, wireline and well testing; founded 1982 as Oman's first oilfield services company (majority owned by ADNOC Drilling since 2025).",
    specialtyAr: "حفر وصيانة آبار وخدمات السلك واختبار الآبار؛ تأسست 1982 كأول شركة خدمات حقول نفط في عُمان (حصة الأغلبية لأدنوك للحفر منذ 2025).",
    website: null,
    source: "The Energy Year (Nov 2025)",
  },
  {
    name: "Special Technical Services (STS)", nameAr: "الخدمات الفنية الخاصة",
    companyName: "Special Technical Services LLC",
    specialty: "Construction, fabrication, plant maintenance and shutdowns; with Worley (SWIS) holds the EPC contract for bp's Block 61 (extended Dec 2024).",
    specialtyAr: "إنشاءات وتصنيع وصيانة المصانع والإيقافات؛ مع وورلي (SWIS) تنفّذ عقد الهندسة والتوريد والإنشاء لمربع 61 التابع لـ bp (تم تمديده ديسمبر 2024).",
    website: null,
    source: "Hydrocarbon Engineering (Dec 2024); Oil & Gas Journal",
  },
  {
    name: "Biyaq Oilfield Services", nameAr: "بياق لخدمات حقول النفط",
    companyName: "Biyaq Oilfield Services LLC",
    specialty: "Well services: production enhancement, well testing, acid stimulation and wellhead maintenance (founded 1996, Muscat).",
    specialtyAr: "خدمات الآبار: تحسين الإنتاج، اختبار الآبار، التحفيز الحمضي وصيانة رؤوس الآبار (تأسست 1996، مسقط).",
    website: null,
    source: "Public company profile",
  },
  {
    name: "OOISS", nameAr: "عُمان لتوريدات وخدمات الصناعات النفطية",
    companyName: "Oman Oil Industries Supplies & Services Co.",
    specialty: "Oilfield equipment supply and services, with bases in Muscat and Nizwa.",
    specialtyAr: "توريد معدات وخدمات حقول النفط، مع قواعد في مسقط ونزوى.",
    website: null,
    source: "Public company profile",
  },
];

async function main() {
  let created = 0, refreshed = 0;
  for (const c of CONTRACTORS) {
    const existing = await db.contractor.findFirst({ where: { companyName: c.companyName }, select: { id: true } });
    console.log(`${existing ? "refresh" : "create "}  ${c.companyName}`);
    if (!APPLY) continue;
    if (existing) {
      await db.contractor.update({ where: { id: existing.id }, data: c });
      refreshed++;
    } else {
      await db.contractor.create({ data: { ...c, status: "PREQUALIFICATION", safetyRating: 0 } });
      created++;
    }
  }
  if (!APPLY) { console.log("\nDry run. Re-run with --apply to write."); return; }
  await appendAuditLog({
    module: "CONTRACTORS", action: "REGISTRY_SEEDED", actionType: "MANUAL", isAutonomous: false,
    description: `Contractor registry loaded from public sources (${created} new, ${refreshed} refreshed)`,
  });
  console.log(`\nDone: ${created} created, ${refreshed} refreshed.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
