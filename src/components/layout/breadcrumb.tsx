"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const PATH_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  command: "Command Center",
  operations: "Operations",
  safety: "Safety",
  governance: "Governance",
  intelligence: "Intelligence",
  admin: "Administration",
  map: "Site Map",
  emergencies: "Emergencies",
  sites: "Work Sites",
  permits: "Permits",
  sensors: "Sensors",
  tasks: "Tasks",
  incidents: "Incidents",
  observations: "Observations",
  investigations: "Investigations",
  risk: "Risk Assessment",
  ppe: "PPE Monitor",
  compliance: "Compliance",
  contractors: "Contractors",
  inspections: "Inspections",
  documents: "Documents",
  training: "Training",
  ai: "AI Predictions",
  rules: "Rule Engine",
  audit: "Audit Log",
  users: "Users",
  alerts: "Alerts",
  settings: "Settings",
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">AEGIS</span>
      {segments.map((seg, i) => {
        const label = PATH_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={isLast ? "font-medium text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}