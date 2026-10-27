import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { Observatory } from "@/components/observatory/observatory";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("observatory.title"), description: t("observatory.subtitle") };
}

/** Public page: forecast map and governorate warnings for Oman. */
export default function ObservatoryPage() {
  return <Observatory />;
}
