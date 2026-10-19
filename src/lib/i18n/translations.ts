/**
 * AEGIS Multi-language Support
 * Supports: English, Arabic (RTL), Urdu (RTL), Nepali (LTR)
 *
 * Use: const { t, lang, setLang } = useTranslation();
 *      <h1>{t("nav.dashboard")}</h1>
 */

export type Language = "en" | "ar";

export const LANGUAGES: Record<Language, {
  name: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
}> = {
  en: { name: "English", nativeName: "English", flag: "🇬🇧", rtl: false },
  ar: { name: "Arabic", nativeName: "العربية", flag: "🇴🇲", rtl: true },
};

export type TranslationKey = keyof typeof translations.en;

export const translations = {
  en: {
    // Common
    "common.welcome": "Welcome to AEGIS",
    "common.login": "Login",
    "common.logout": "Logout",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.search": "Search",
    "common.loading": "Loading...",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",

    // Navigation - Modules
    "nav.command": "Command Center",
    "nav.operations": "Operations",
    "nav.safety": "Safety",
    "nav.governance": "Governance",
    "nav.intelligence": "Intelligence",
    "nav.admin": "Administration",

    // Navigation - Items
    "nav.dashboard": "Dashboard",
    "nav.map": "Site Map",
    "nav.emergencies": "Emergencies",
    "nav.sites": "Work Sites",
    "nav.pipelines": "Pipelines",
    "nav.permits": "Permits",
    "nav.sensors": "IoT Sensors",
    "nav.tasks": "Tasks",
    "nav.devices": "Field Devices",
    "nav.drones": "Drones",
    "nav.esp32": "ESP32 Live",
    "nav.incidents": "Incidents",
    "nav.observations": "Observations",
    "nav.investigations": "Investigations",
    "nav.risk": "Risk Assessment",
    "nav.ppe": "PPE Monitor",
    "nav.aichat": "AI Chat",
    "nav.predictions": "AI Predictions",
    "nav.rules": "Rule Engine",
    "nav.audit": "Audit Log",

    // Status
    "status.normal": "Normal",
    "status.warning": "Warning",
    "status.critical": "Critical",
    "status.active": "Active",
    "status.operational": "Operational",
    "status.maintenance": "Maintenance",
    "status.offline": "Offline",

    // Severity
    "severity.low": "Low",
    "severity.medium": "Medium",
    "severity.high": "High",
    "severity.critical": "Critical",

    // Pipelines
    "pipeline.title": "Pipeline Network",
    "pipeline.subtitle": "Real-time monitoring of pipeline infrastructure",
    "pipeline.total": "Total Pipelines",
    "pipeline.operational": "Operational",
    "pipeline.activeLeaks": "Active Leaks",
    "pipeline.pressureAlerts": "Pressure Alerts",
    "pipeline.length": "Length",
    "pipeline.diameter": "Diameter",
    "pipeline.pressure": "Pressure",
    "pipeline.simulate": "Simulate Anomaly",
    "pipeline.analyze": "Analyze with AEGIS AI",
    "pipeline.leakDetected": "Leak Detected",
    "pipeline.confidence": "Confidence",
    "pipeline.immediateActions": "Immediate Actions",
    "pipeline.predictions": "Predictions",
    "pipeline.rootCause": "Root Cause",

    // Voice
    "voice.listening": "Listening...",
    "voice.processing": "Processing...",
    "voice.tryAgain": "Try again",
    "voice.tapToSpeak": "Tap to speak",

    // Safety
    "safety.emergency": "Emergency",
    "safety.evacuate": "Evacuate",
    "safety.allClear": "All Clear",

    // Worker
    "worker.iAmSafe": "I am safe",
    "worker.needHelp": "I need help",
    "worker.reportIncident": "Report incident",
    "worker.checkSensors": "Check my sensors",
  },

  ar: {
    // Common
    "common.welcome": "مرحباً بكم في AEGIS",
    "common.login": "تسجيل الدخول",
    "common.logout": "تسجيل الخروج",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.delete": "حذف",
    "common.edit": "تعديل",
    "common.search": "بحث",
    "common.loading": "جاري التحميل...",
    "common.confirm": "تأكيد",
    "common.yes": "نعم",
    "common.no": "لا",

    // Navigation
    "nav.command": "مركز القيادة",
    "nav.operations": "العمليات",
    "nav.safety": "السلامة",
    "nav.governance": "الحوكمة",
    "nav.intelligence": "الذكاء",
    "nav.admin": "الإدارة",
    "nav.dashboard": "لوحة التحكم",
    "nav.map": "خريطة المواقع",
    "nav.emergencies": "الطوارئ",
    "nav.sites": "مواقع العمل",
    "nav.pipelines": "خطوط الأنابيب",
    "nav.permits": "تصاريح العمل",
    "nav.sensors": "أجهزة الاستشعار",
    "nav.tasks": "المهام",
    "nav.devices": "الأجهزة الميدانية",
    "nav.drones": "الطائرات المسيّرة",
    "nav.esp32": "المراقبة الحية",
    "nav.incidents": "الحوادث",
    "nav.observations": "الملاحظات",
    "nav.investigations": "التحقيقات",
    "nav.risk": "تقييم المخاطر",
    "nav.ppe": "مراقبة معدات الحماية",
    "nav.aichat": "المساعد الذكي",
    "nav.predictions": "التنبؤات الذكية",
    "nav.rules": "محرك القواعد",
    "nav.audit": "سجل التدقيق",

    // Status
    "status.normal": "طبيعي",
    "status.warning": "تحذير",
    "status.critical": "حرج",
    "status.active": "نشط",
    "status.operational": "تشغيلي",
    "status.maintenance": "صيانة",
    "status.offline": "غير متصل",

    // Severity
    "severity.low": "منخفض",
    "severity.medium": "متوسط",
    "severity.high": "مرتفع",
    "severity.critical": "حرج",

    // Pipelines
    "pipeline.title": "شبكة خطوط الأنابيب",
    "pipeline.subtitle": "المراقبة الفورية للبنية التحتية لخطوط الأنابيب",
    "pipeline.total": "إجمالي خطوط الأنابيب",
    "pipeline.operational": "تشغيلي",
    "pipeline.activeLeaks": "التسربات النشطة",
    "pipeline.pressureAlerts": "تنبيهات الضغط",
    "pipeline.length": "الطول",
    "pipeline.diameter": "القطر",
    "pipeline.pressure": "الضغط",
    "pipeline.simulate": "محاكاة شذوذ",
    "pipeline.analyze": "تحليل بواسطة AEGIS AI",
    "pipeline.leakDetected": "تم اكتشاف تسرب",
    "pipeline.confidence": "نسبة الثقة",
    "pipeline.immediateActions": "الإجراءات الفورية",
    "pipeline.predictions": "التنبؤات",
    "pipeline.rootCause": "السبب الجذري",

    // Voice
    "voice.listening": "جاري الاستماع...",
    "voice.processing": "جاري المعالجة...",
    "voice.tryAgain": "حاول مرة أخرى",
    "voice.tapToSpeak": "اضغط للتحدث",

    // Safety
    "safety.emergency": "طوارئ",
    "safety.evacuate": "إخلاء",
    "safety.allClear": "كل شيء آمن",

    // Worker
    "worker.iAmSafe": "أنا بأمان",
    "worker.needHelp": "أحتاج مساعدة",
    "worker.reportIncident": "تسجيل حادثة",
    "worker.checkSensors": "افحص حساساتي",
  },


} as const;

/**
 * Get translation for a key in the specified language.
 * Falls back to English if key not found.
 */
export function getTranslation(lang: Language, key: string): string {
  const langDict = translations[lang] as Record<string, string>;
  if (langDict && langDict[key]) {
    return langDict[key];
  }
  // Fallback to English
  const enDict = translations.en as Record<string, string>;
  return enDict[key] || key;
}