import {
  type LucideIcon,
  LayoutDashboard,
  MonitorDot,
  Siren,
  BellRing,
  FileCheck2,
  ListChecks,
  Building2,
  AlertTriangle,
  Eye,
  ShieldAlert,
  HeartPulse,
  Waypoints,
  Gauge,
  Cpu,
  ClipboardCheck,
  SearchCheck,
  HardHat,
  GraduationCap,
  FileText,
  BrainCircuit,
  Users,
  Lock,
  Workflow,
  SlidersHorizontal,
  ScrollText,
  Settings,
  Activity,
  Briefcase,
  Boxes,
  Scale,
  Shield,
} from "lucide-react";
import type { Role } from "@/lib/constants";
import { canAccessRoute } from "@/lib/rbac";

export interface NavItem {
  label: string;
  labelAr: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export interface NavModule {
  id: string;
  label: string;
  labelAr: string;
  icon: LucideIcon;
  items: NavItem[];
}

/**
 * Sidebar, grouped by job (not by technology). Related pages live behind
 * SectionTabs inside one entry (e.g. Incidents | Investigations), so users
 * never hop between systems. Visibility comes from the RBAC matrix only.
 */
export const NAVIGATION: NavModule[] = [
  {
    id: "monitor",
    label: "Monitoring",
    labelAr: "المراقبة",
    icon: Activity,
    items: [
      { label: "Overview", labelAr: "نظرة عامة", href: "/dashboard", icon: LayoutDashboard },
      { label: "Command center", labelAr: "مركز القيادة", href: "/command", icon: MonitorDot },
      { label: "Emergencies", labelAr: "الطوارئ", href: "/command/emergencies", icon: Siren },
      { label: "Alerts", labelAr: "التنبيهات", href: "/admin/alerts", icon: BellRing },
    ],
  },
  {
    id: "field",
    label: "Field work",
    labelAr: "العمل الميداني",
    icon: Briefcase,
    items: [
      { label: "Work permits", labelAr: "تصاريح العمل", href: "/operations/permits", icon: FileCheck2 },
      { label: "Tasks", labelAr: "المهام", href: "/operations/tasks", icon: ListChecks },
      { label: "Sites", labelAr: "المواقع", href: "/operations/sites", icon: Building2 },
    ],
  },
  {
    id: "safety",
    label: "Incidents and risk",
    labelAr: "الحوادث والمخاطر",
    icon: Shield,
    items: [
      { label: "Incidents", labelAr: "الحوادث", href: "/safety/incidents", icon: AlertTriangle },
      { label: "Observations", labelAr: "الملاحظات", href: "/safety/observations", icon: Eye },
      { label: "Risk assessments", labelAr: "تقييم المخاطر", href: "/safety/risk", icon: ShieldAlert },
      { label: "Worker safety", labelAr: "سلامة العاملين", href: "/safety/wellness", icon: HeartPulse },
    ],
  },
  {
    id: "assets",
    label: "Assets",
    labelAr: "الأصول",
    icon: Boxes,
    items: [
      { label: "Pipelines", labelAr: "خطوط الأنابيب", href: "/operations/pipelines", icon: Waypoints },
      { label: "Sensors", labelAr: "المستشعرات", href: "/operations/sensors", icon: Gauge },
      { label: "Devices", labelAr: "الأجهزة", href: "/operations/devices", icon: Cpu },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    labelAr: "الامتثال",
    icon: Scale,
    items: [
      { label: "Compliance", labelAr: "متطلبات الامتثال", href: "/governance/compliance", icon: ClipboardCheck },
      { label: "Inspections", labelAr: "التفتيش", href: "/governance/inspections", icon: SearchCheck },
      { label: "Contractors", labelAr: "المقاولون", href: "/governance/contractors", icon: HardHat },
      { label: "Training", labelAr: "التدريب", href: "/governance/training", icon: GraduationCap },
      { label: "Documents", labelAr: "المستندات", href: "/governance/documents", icon: FileText },
    ],
  },
  {
    id: "assistant",
    label: "Assistant",
    labelAr: "المساعد",
    icon: BrainCircuit,
    items: [{ label: "AEGIS assistant", labelAr: "مساعد AEGIS", href: "/intelligence/chat", icon: BrainCircuit }],
  },
  {
    id: "admin",
    label: "Administration",
    labelAr: "الإدارة",
    icon: Settings,
    items: [
      { label: "Users", labelAr: "المستخدمون", href: "/admin/users", icon: Users },
      { label: "Security", labelAr: "الأمان", href: "/admin/security", icon: Lock },
      { label: "Automation", labelAr: "الأتمتة", href: "/admin/autonomy", icon: Workflow },
      { label: "Rules", labelAr: "القواعد", href: "/intelligence/rules", icon: SlidersHorizontal },
      { label: "Audit log", labelAr: "سجل التدقيق", href: "/intelligence/audit", icon: ScrollText },
      { label: "Settings", labelAr: "الإعدادات", href: "/admin/settings", icon: Settings },
    ],
  },
];

/** Only links the role can open; empty groups are hidden. */
export function filterNavigationForRole(role: Role): NavModule[] {
  return NAVIGATION.map((m) => ({ ...m, items: m.items.filter((i) => canAccessRoute(role, i.href)) })).filter(
    (m) => m.items.length > 0,
  );
}
