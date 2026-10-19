"use client";

import { useSession } from "next-auth/react";
import { SectionTabs } from "./section-tabs";
import { MODULE_TABS, type ModuleTabsId } from "@/lib/module-tabs";
import { canAccessRoute } from "@/lib/rbac";
import { useT } from "@/lib/i18n/client";
import type { Role } from "@/lib/constants";

/** Tabs for a merged section; hides tabs the user's role cannot open. */
export function ModuleTabs({ id, className }: { id: ModuleTabsId; className?: string }) {
  const t = useT();
  const role = useSession().data?.user?.role as Role | undefined;
  const tabs = MODULE_TABS[id]
    .filter((tab) => !role || canAccessRoute(role, tab.href))
    .map((tab) => ({ href: tab.href, label: t(tab.key), prefix: !("exact" in tab && tab.exact) }));
  if (tabs.length < 2) return null;
  return <SectionTabs tabs={tabs} label={t("tabs.label")} className={className} />;
}
