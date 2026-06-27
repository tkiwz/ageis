/**
 * AEGIS Multi-language Support
 * Supports: English, Arabic (RTL), Urdu (RTL), Nepali (LTR)
 *
 * Use: const { t, lang, setLang } = useTranslation();
 *      <h1>{t("nav.dashboard")}</h1>
 */

export type Language = "en" | "ar" | "ur" | "ne";

export const LANGUAGES: Record<Language, {
  name: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
}> = {
  en: { name: "English", nativeName: "English", flag: "🇬🇧", rtl: false },
  ar: { name: "Arabic", nativeName: "العربية", flag: "🇴🇲", rtl: true },
  ur: { name: "Urdu", nativeName: "اردو", flag: "🇵🇰", rtl: true },
  ne: { name: "Nepali", nativeName: "नेपाली", flag: "🇳🇵", rtl: false },
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

  ur: {
    // Common
    "common.welcome": "AEGIS میں خوش آمدید",
    "common.login": "لاگ ان",
    "common.logout": "لاگ آؤٹ",
    "common.save": "محفوظ کریں",
    "common.cancel": "منسوخ کریں",
    "common.delete": "حذف کریں",
    "common.edit": "ترمیم کریں",
    "common.search": "تلاش کریں",
    "common.loading": "لوڈ ہو رہا ہے...",
    "common.confirm": "تصدیق",
    "common.yes": "ہاں",
    "common.no": "نہیں",

    // Navigation
    "nav.command": "کمانڈ سینٹر",
    "nav.operations": "آپریشنز",
    "nav.safety": "سیفٹی",
    "nav.governance": "گورننس",
    "nav.intelligence": "انٹیلیجنس",
    "nav.admin": "ایڈمنسٹریشن",
    "nav.dashboard": "ڈیش بورڈ",
    "nav.map": "سائٹ کا نقشہ",
    "nav.emergencies": "ایمرجنسی",
    "nav.sites": "کام کی جگہیں",
    "nav.pipelines": "پائپ لائنز",
    "nav.permits": "پرمٹس",
    "nav.sensors": "سینسرز",
    "nav.tasks": "کام",
    "nav.devices": "فیلڈ ڈیوائسز",
    "nav.drones": "ڈرونز",
    "nav.esp32": "لائیو مانیٹرنگ",
    "nav.incidents": "حادثات",
    "nav.observations": "مشاہدات",
    "nav.investigations": "تحقیقات",
    "nav.risk": "خطرات کی تشخیص",
    "nav.ppe": "PPE مانیٹر",
    "nav.aichat": "AI چیٹ",
    "nav.predictions": "AI پیشن گوئیاں",
    "nav.rules": "رولز انجن",
    "nav.audit": "آڈٹ لاگ",

    // Status
    "status.normal": "نارمل",
    "status.warning": "وارننگ",
    "status.critical": "خطرناک",
    "status.active": "فعال",
    "status.operational": "آپریشنل",
    "status.maintenance": "مرمت",
    "status.offline": "آف لائن",

    // Severity
    "severity.low": "کم",
    "severity.medium": "درمیانہ",
    "severity.high": "زیادہ",
    "severity.critical": "خطرناک",

    // Pipelines
    "pipeline.title": "پائپ لائن نیٹ ورک",
    "pipeline.subtitle": "پائپ لائن انفراسٹرکچر کی حقیقی وقت کی نگرانی",
    "pipeline.total": "کل پائپ لائنز",
    "pipeline.operational": "آپریشنل",
    "pipeline.activeLeaks": "فعال لیکس",
    "pipeline.pressureAlerts": "پریشر الرٹس",
    "pipeline.length": "لمبائی",
    "pipeline.diameter": "قطر",
    "pipeline.pressure": "دباؤ",
    "pipeline.simulate": "اینومالی سمولیٹ کریں",
    "pipeline.analyze": "AEGIS AI سے تجزیہ کریں",
    "pipeline.leakDetected": "لیک پایا گیا",
    "pipeline.confidence": "اعتماد",
    "pipeline.immediateActions": "فوری اقدامات",
    "pipeline.predictions": "پیشن گوئیاں",
    "pipeline.rootCause": "بنیادی وجہ",

    // Voice
    "voice.listening": "سن رہا ہوں...",
    "voice.processing": "پروسیسنگ...",
    "voice.tryAgain": "دوبارہ کوشش کریں",
    "voice.tapToSpeak": "بولنے کے لیے ٹیپ کریں",

    // Safety
    "safety.emergency": "ایمرجنسی",
    "safety.evacuate": "نکل جائیں",
    "safety.allClear": "سب کلیئر",

    // Worker
    "worker.iAmSafe": "میں محفوظ ہوں",
    "worker.needHelp": "مجھے مدد چاہیے",
    "worker.reportIncident": "واقعہ رپورٹ کریں",
    "worker.checkSensors": "میرے سینسرز چیک کریں",
  },

  ne: {
    // Common
    "common.welcome": "AEGIS मा स्वागत छ",
    "common.login": "लग इन",
    "common.logout": "लग आउट",
    "common.save": "सेभ गर्नुहोस्",
    "common.cancel": "रद्द गर्नुहोस्",
    "common.delete": "मेटाउनुहोस्",
    "common.edit": "सम्पादन",
    "common.search": "खोज्नुहोस्",
    "common.loading": "लोड हुँदै...",
    "common.confirm": "पुष्टि",
    "common.yes": "हो",
    "common.no": "होइन",

    // Navigation
    "nav.command": "कमाण्ड सेन्टर",
    "nav.operations": "सञ्चालन",
    "nav.safety": "सुरक्षा",
    "nav.governance": "शासन",
    "nav.intelligence": "बुद्धिमत्ता",
    "nav.admin": "प्रशासन",
    "nav.dashboard": "ड्यासबोर्ड",
    "nav.map": "साइट नक्सा",
    "nav.emergencies": "आपतकाल",
    "nav.sites": "कार्य साइटहरू",
    "nav.pipelines": "पाइपलाइनहरू",
    "nav.permits": "अनुमतिहरू",
    "nav.sensors": "सेन्सरहरू",
    "nav.tasks": "कार्यहरू",
    "nav.devices": "फिल्ड उपकरणहरू",
    "nav.drones": "ड्रोनहरू",
    "nav.esp32": "लाइभ निगरानी",
    "nav.incidents": "घटनाहरू",
    "nav.observations": "अवलोकनहरू",
    "nav.investigations": "अनुसन्धान",
    "nav.risk": "जोखिम मूल्यांकन",
    "nav.ppe": "PPE मनिटर",
    "nav.aichat": "AI च्याट",
    "nav.predictions": "AI भविष्यवाणीहरू",
    "nav.rules": "नियम इन्जिन",
    "nav.audit": "अडिट लग",

    // Status
    "status.normal": "सामान्य",
    "status.warning": "चेतावनी",
    "status.critical": "गम्भीर",
    "status.active": "सक्रिय",
    "status.operational": "सञ्चालनमा",
    "status.maintenance": "मर्मत",
    "status.offline": "अफलाइन",

    // Severity
    "severity.low": "कम",
    "severity.medium": "मध्यम",
    "severity.high": "उच्च",
    "severity.critical": "गम्भीर",

    // Pipelines
    "pipeline.title": "पाइपलाइन नेटवर्क",
    "pipeline.subtitle": "पाइपलाइन पूर्वाधारको वास्तविक समय निगरानी",
    "pipeline.total": "कुल पाइपलाइनहरू",
    "pipeline.operational": "सञ्चालनमा",
    "pipeline.activeLeaks": "सक्रिय चुहावटहरू",
    "pipeline.pressureAlerts": "दबाव चेतावनीहरू",
    "pipeline.length": "लम्बाइ",
    "pipeline.diameter": "व्यास",
    "pipeline.pressure": "दबाव",
    "pipeline.simulate": "अनोमलि सिमुलेट",
    "pipeline.analyze": "AEGIS AI सँग विश्लेषण",
    "pipeline.leakDetected": "चुहावट पत्ता लाग्यो",
    "pipeline.confidence": "विश्वास",
    "pipeline.immediateActions": "तत्काल कार्यहरू",
    "pipeline.predictions": "भविष्यवाणीहरू",
    "pipeline.rootCause": "मूल कारण",

    // Voice
    "voice.listening": "सुन्दै...",
    "voice.processing": "प्रशोधन गर्दै...",
    "voice.tryAgain": "फेरि प्रयास गर्नुहोस्",
    "voice.tapToSpeak": "बोल्न ट्याप गर्नुहोस्",

    // Safety
    "safety.emergency": "आपतकाल",
    "safety.evacuate": "खाली गर्नुहोस्",
    "safety.allClear": "सबै सफा",

    // Worker
    "worker.iAmSafe": "म सुरक्षित छु",
    "worker.needHelp": "मलाई मद्दत चाहिन्छ",
    "worker.reportIncident": "घटना रिपोर्ट गर्नुहोस्",
    "worker.checkSensors": "मेरो सेन्सरहरू जाँच गर्नुहोस्",
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