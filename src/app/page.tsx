import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  Shield, GitBranch, HeartPulse, Sparkles, Mic, ClipboardCheck,
  ShieldCheck, LogIn, LayoutDashboard, Smartphone, ArrowRight,
  Factory, Activity, AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();

  // Live stats — public counts, no PII
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [sitesCount, pipelinesCount, activePermits, incidentsToday] = await Promise.all([
    db.site.count({ where: { status: "ACTIVE" } }).catch(() => 0),
    db.pipeline.count().catch(() => 0),
    db.permit.count({ where: { status: { in: ["ACTIVE", "APPROVED"] } } }).catch(() => 0),
    db.incident.count({ where: { occurredAt: { gte: startOfDay } } }).catch(() => 0),
  ]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-grid">
      {/* Animated scan line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-[scan_8s_linear_infinite]" />

      <div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* ───────── HERO ───────── */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
            <Shield className="relative h-16 w-16 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-5xl tracking-tight text-foreground sm:text-6xl">AEGIS</h1>
          <p className="mt-3 text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Autonomous HSSE Command Platform
          </p>
          <p dir="rtl" className="mt-2 text-sm text-muted-foreground/80">
            منصة القيادة الذكية للصحة والسلامة الصناعية
          </p>

          {/* Live status */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-risk-low/30 bg-risk-low/10 px-3 py-1.5 text-xs text-risk-low">
            <span className="status-dot status-online" />
            OPERATIONAL · {sitesCount} sites · {pipelinesCount} pipelines monitored
          </div>
        </div>

        {/* ───────── VALUE CARDS ───────── */}
        <div className="grid w-full max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glass group rounded-lg border border-border/50 p-4 transition-all hover:border-primary/40 hover:-translate-y-0.5"
            >
              <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p dir="rtl" className="mt-0.5 text-[11px] text-muted-foreground/70">{f.titleAr}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ───────── LIVE STATS STRIP ───────── */}
        <div className="mt-8 grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Factory} label="Active Sites" labelAr="مواقع نشطة" value={sitesCount} />
          <Stat icon={GitBranch} label="Pipelines" labelAr="خطوط أنابيب" value={pipelinesCount} />
          <Stat icon={ClipboardCheck} label="Active Permits" labelAr="تصاريح فعّالة" value={activePermits} />
          <Stat
            icon={AlertTriangle}
            label="Incidents Today"
            labelAr="حوادث اليوم"
            value={incidentsToday}
            tone={incidentsToday > 0 ? "warning" : "success"}
          />
        </div>

        {/* ───────── CTAs ───────── */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {session ? (
            <>
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/15 px-5 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/25"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Command Center
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/m"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              >
                <Smartphone className="h-4 w-4" />
                Mobile App
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/15 px-5 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/25"
              >
                <LogIn className="h-4 w-4" />
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/m"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
              >
                <Smartphone className="h-4 w-4" />
                Field worker app
              </Link>
            </>
          )}
        </div>

        {/* ───────── FOOTER ───────── */}
        <footer className="mt-12 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground/50">
            <span>AEGIS</span>
            <span>·</span>
            <span>v1.0</span>
            <span>·</span>
            <span className="text-risk-low/70">Pilot-Ready</span>
            <span>·</span>
            <Link href="/governance/privacy" className="hover:text-muted-foreground transition">Privacy</Link>
            <span>·</span>
            <Link href="/api/health" className="hover:text-muted-foreground transition">Health</Link>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/30">
            Next.js · Prisma · Claude Sonnet 4.5 · Built for Oman&apos;s oil &amp; gas
          </div>
        </footer>
      </div>
    </main>
  );
}

// ─── Data ──────────────────────────────────────────────

const FEATURES = [
  {
    icon: GitBranch,
    title: "Autonomous Pipeline Monitoring",
    titleAr: "مراقبة ذاتية لخطوط الأنابيب",
    desc: "AI scans pressure readings every 30 seconds. Detects leaks before humans see them, with confidence-gated cascade.",
  },
  {
    icon: HeartPulse,
    title: "Worker Wellness",
    titleAr: "صحة العاملين",
    desc: "Heat stress, H2S/CO exposure, heart rate, and fall detection from ESP32 wearables — alerts before injury.",
  },
  {
    icon: Sparkles,
    title: "Predictive Forecast",
    titleAr: "توقّعات المخاطر اليومية",
    desc: "Tomorrow's risk profile, generated daily from operational data, weather, and permit activity.",
  },
  {
    icon: Mic,
    title: "Voice Commands",
    titleAr: "أوامر صوتية",
    desc: "Create incidents, assign tasks, check status — hands-free in English, Arabic, Urdu, and Nepali.",
  },
  {
    icon: ClipboardCheck,
    title: "Smart Permit Approval",
    titleAr: "موافقة ذكية على التصاريح",
    desc: "AI reviews PTW requests for conflicts, missing PPE, contractor history. Recommends approve, modify, or reject.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance Built-in",
    titleAr: "الامتثال مدمج بالنظام",
    desc: "Oman PDPL data exports, ISO 45001-aligned audit trail, 7-year retention for safety-critical events.",
  },
] as const;

// ─── Components ────────────────────────────────────────

function Stat({
  icon: Icon, label, labelAr, value, tone = "info",
}: {
  icon: typeof Activity;
  label: string;
  labelAr: string;
  value: number;
  tone?: "info" | "success" | "warning";
}) {
  const colors = {
    info: "text-foreground",
    success: "text-risk-low",
    warning: "text-risk-medium",
  };
  return (
    <div className="glass rounded-lg border border-border/50 p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-1.5 font-display text-3xl ${colors[tone]}`}>
        {value}
      </div>
      <div dir="rtl" className="mt-0.5 text-[10px] text-muted-foreground/60">
        {labelAr}
      </div>
    </div>
  );
}
