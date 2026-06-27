import {
  type LucideIcon,
  LayoutDashboard,
  Map,
  Siren,
  Factory,
  ClipboardCheck,
  Radio,
  CheckSquare,
  AlertTriangle,
  Eye,
  Search,
  ShieldAlert,
  FileCheck,
  Users,
  ClipboardList,
  GraduationCap,
  Brain,
  Sparkles,
  Zap,
  ScrollText,
  UserCog,
  Bell,
  Settings,
  MessageSquare,
  Cpu,
  Activity,
  GitBranch,
  ShieldOff,
  Lock,
} from "lucide-react";
import type { Role } from "@/lib/constants";

export interface NavItem {
  label: string;
  labelAr?: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  badge?: number;
}

export interface NavModule {
  id: string;
  label: string;
  labelAr: string;
  icon: LucideIcon;
  roles: Role[];
  items: NavItem[];
}

export const NAVIGATION: NavModule[] = [
  {
    id: "command",
    label: "Command Center",
    labelAr: "مركز القيادة",
    icon: Siren,
    roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
    items: [
      {
        label: "Executive Dashboard",
        labelAr: "اللوحة التنفيذية",
        href: "/dashboard",
        icon: LayoutDashboard,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
      },
      {
        label: "Site Map",
        labelAr: "خريطة المواقع",
        href: "/command/map",
        icon: Map,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
      {
        label: "Emergencies",
        labelAr: "الطوارئ",
        href: "/command/emergencies",
        icon: Siren,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    labelAr: "العمليات",
    icon: Factory,
    roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
    items: [
      {
        label: "Work Sites",
        labelAr: "مواقع العمل",
        href: "/operations/sites",
        icon: Factory,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "Pipelines",
        labelAr: "خطوط الأنابيب",
        href: "/operations/pipelines",
        icon: GitBranch,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "Permits (PTW)",
        labelAr: "تصاريح العمل",
        href: "/operations/permits",
        icon: ClipboardCheck,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
      },
      {
        label: "Sensors",
        labelAr: "أجهزة الاستشعار",
        href: "/operations/sensors",
        icon: Radio,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "Tasks",
        labelAr: "المهام",
        href: "/operations/tasks",
        icon: CheckSquare,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "Field Devices",
        labelAr: "الأجهزة الميدانية",
        href: "/operations/devices",
        icon: Cpu,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
      },
      {
        label: "Drones",
        labelAr: "الطائرات المسيّرة",
        href: "/operations/drones",
        icon: Radio,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
      },
    ],
  },
  {
    id: "safety",
    label: "Safety",
    labelAr: "السلامة",
    icon: ShieldAlert,
    roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
    items: [
      {
        label: "Incidents",
        labelAr: "الحوادث",
        href: "/safety/incidents",
        icon: AlertTriangle,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
      },
      {
        label: "Observations",
        labelAr: "الملاحظات",
        href: "/safety/observations",
        icon: Eye,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "Investigations",
        labelAr: "التحقيقات",
        href: "/safety/investigations",
        icon: Search,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
      {
        label: "Risk Assessment",
        labelAr: "تقييم المخاطر",
        href: "/safety/risk",
        icon: ShieldAlert,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    labelAr: "الحوكمة",
    icon: FileCheck,
    roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
    items: [
      {
        label: "Compliance",
        labelAr: "الامتثال",
        href: "/governance/compliance",
        icon: FileCheck,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Contractors",
        labelAr: "المقاولون",
        href: "/governance/contractors",
        icon: Users,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Inspections",
        labelAr: "التفتيشات",
        href: "/governance/inspections",
        icon: ClipboardList,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
      {
        label: "Privacy & Compliance",
        labelAr: "الخصوصية والامتثال",
        href: "/governance/privacy",
        icon: Lock,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    labelAr: "الذكاء",
    icon: Brain,
    roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
    items: [
      {
        label: "AI Chat",
        labelAr: "المساعد الذكي",
        href: "/intelligence/chat",
        icon: MessageSquare,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
      },
      {
        label: "AI Predictions",
        labelAr: "التنبؤات الذكية",
        href: "/intelligence/ai",
        icon: Brain,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Rule Engine",
        labelAr: "محرك القواعد",
        href: "/intelligence/rules",
        icon: Zap,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "AEGIS Brain",
        labelAr: "العقل المركزي",
        href: "/intelligence/brain",
        icon: Brain,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
      {
        label: "Knowledge",
        labelAr: "المعرفة",
        href: "/intelligence/knowledge",
        icon: GraduationCap,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
      },
      {
        label: "AI Suggestions",
        labelAr: "اقتراحات الذكاء",
        href: "/intelligence/suggestions",
        icon: Sparkles,
        roles: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
      },
      {
        label: "Audit Log",
        labelAr: "سجل التدقيق",
        href: "/intelligence/audit",
        icon: ScrollText,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    labelAr: "الإدارة",
    icon: Settings,
    roles: ["ADMIN", "HSSE_MANAGER"],
    items: [
      {
        label: "Users",
        labelAr: "المستخدمون",
        href: "/admin/users",
        icon: UserCog,
        roles: ["ADMIN"],
      },
      {
        label: "Autonomy Control",
        labelAr: "التحكم الذاتي",
        href: "/admin/autonomy",
        icon: ShieldOff,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Security",
        labelAr: "الأمن",
        href: "/admin/security",
        icon: Lock,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Alerts",
        labelAr: "التنبيهات",
        href: "/admin/alerts",
        icon: Bell,
        roles: ["ADMIN", "HSSE_MANAGER"],
      },
      {
        label: "Settings",
        labelAr: "الإعدادات",
        href: "/admin/settings",
        icon: Settings,
        roles: ["ADMIN"],
      },
    ],
  },
];

export function filterNavigationForRole(role: Role): NavModule[] {
  return NAVIGATION
    .filter((module) => module.roles.includes(role))
    .map((module) => ({
      ...module,
      items: module.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((module) => module.items.length > 0);
}
