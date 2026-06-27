import { requireAuth }  from "@/lib/auth-helpers";
import {
  Lock, Clock, Database, FileText, ShieldCheck,
  CheckCircle2, AlertCircle, Scale, BookOpen,
} from "lucide-react";
import { PrivacyActions } from "./privacy-actions";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────

const COMPLIANCE_CHECKS = [
  { label: "Incident records retained per MoEM regulations",      done: true,  reg: "ISO 45001 §10.2" },
  { label: "AI decisions linked to incidents logged for 7 years", done: true,  reg: "PDPL Art. 7"     },
  { label: "Wearable health data limited to 90-day retention",    done: true,  reg: "PDPL Art. 5(d)"  },
  { label: "User right of access implemented (data export)",      done: true,  reg: "PDPL Art. 21"    },
  { label: "Every data export is audit-logged",                   done: true,  reg: "ISO 45001 §7.5"  },
  { label: "Voice transcripts purged after 30 days",              done: true,  reg: "PDPL Art. 5(e)"  },
  { label: "Consent captured for opt-in voice features",          done: true,  reg: "PDPL Art. 8"     },
  { label: "Automated data deletion schedule configured",         done: false, reg: "PDPL Art. 9"     },
  { label: "Data Protection Officer (DPO) designated",           done: false, reg: "PDPL Art. 11"    },
];

const RETENTION_ROWS = [
  { cat: "Audit log — CRITICAL / HIGH events", ret: "7 years",               reason: "ISO 45001 + MoEM safety records", priority: "high" },
  { cat: "Audit log — MEDIUM events",          ret: "3 years",               reason: "Operational review window",        priority: "med"  },
  { cat: "Audit log — LOW / no risk",          ret: "1 year",                reason: "Default operational",              priority: "low"  },
  { cat: "Incidents + investigations",         ret: "Permanent until reviewed", reason: "Statutory record",              priority: "high" },
  { cat: "Voice command transcripts",          ret: "30 days",               reason: "User privacy expectation",         priority: "low"  },
  { cat: "Wearable wellness readings (raw)",   ret: "90 days",               reason: "Personal health data",             priority: "med"  },
  { cat: "AI decisions linked to incidents",   ret: "7 years",               reason: "Explainability + audit",           priority: "high" },
  { cat: "AI decisions (unlinked)",            ret: "2 years",               reason: "Operational review",               priority: "med"  },
  { cat: "Notifications — read",              ret: "90 days",               reason: "UI history only",                  priority: "low"  },
  { cat: "Notifications — unread",            ret: "180 days",              reason: "Pending action visibility",         priority: "low"  },
];

const DATA_CATEGORIES = [
  { icon: "👤", label: "Identity",          detail: "Name, email, role, department, phone, last login" },
  { icon: "🔧", label: "Operational",       detail: "Incidents, permits, observations, tasks, training records" },
  { icon: "💓", label: "Wearable (opt-in)", detail: "Heart rate, body temp, H2S/CO exposure, fall detection" },
  { icon: "🎙️", label: "Voice (opt-in)",    detail: "Transcripts, parsed intents — retained 30 days" },
  { icon: "🤖", label: "AI Decisions",      detail: "Inputs + outputs of AI analysis where you are the subject" },
];

const LEGAL_BASES = [
  { basis: "Legal obligation",    color: "border-red-500/30    bg-red-500/8    text-red-400",    text: "Incident records, training records, audit logs — required by ISO 45001 + MoEM." },
  { basis: "Vital interests",     color: "border-amber-500/30  bg-amber-500/8  text-amber-400",  text: "Wearable wellness data — used to prevent heat stroke, H2S and CO exposure injury." },
  { basis: "Legitimate interest", color: "border-primary/30    bg-primary/8    text-primary",    text: "Operational telemetry, audit trails for safety analytics and reporting." },
  { basis: "Consent",             color: "border-green-500/30  bg-green-500/8  text-green-400",  text: "Voice features, optional wearable telemetry, user preferences." },
];

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  med:  "bg-amber-400",
  low:  "bg-muted-foreground",
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default async function PrivacyPage() {
  const user = await requireAuth();

  const done  = COMPLIANCE_CHECKS.filter((c) => c.done).length;
  const total = COMPLIANCE_CHECKS.length;
  const score = Math.round((done / total) * 100);

  return (
    <div className="container mx-auto max-w-4xl px-6 py-6 space-y-5">

      {/* ── Header ───────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2.5">
          <Lock className="h-7 w-7 text-primary" /> Privacy & Compliance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oman PDPL · ISO 45001 · Ministry of Energy & Minerals (MoEM)
          <span className="mx-2 opacity-40">·</span>
          <span dir="rtl" className="inline-block">قانون حماية البيانات الشخصية العماني</span>
        </p>
      </div>

      {/* ── Compliance Score + Checklist ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Score card */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-col items-center justify-center gap-3 text-center">
          <div className="relative w-24 h-24">
            <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-border/40" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - score / 100)}`}
                strokeLinecap="round"
                className="text-primary transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-2xl font-bold text-primary">{score}%</span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Compliance Score</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{done} / {total} checks passed</div>
          </div>
          <div className="flex gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {done} passed</span>
            <span className="flex items-center gap-1 text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {total - done} pending</span>
          </div>
        </div>

        {/* Checklist */}
        <div className="sm:col-span-2 rounded-2xl border border-border/40 bg-background/60 p-5 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            ISO 45001 + PDPL Checklist
          </div>
          {COMPLIANCE_CHECKS.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/10 transition-colors">
              {c.done
                ? <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                : <AlertCircle  className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />}
              <span className="text-xs flex-1 leading-relaxed">{c.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5 bg-muted/30 px-1.5 py-0.5 rounded">
                {c.reg}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Rights ───────────────────────────────────── */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Your Data Rights — PDPL Art. 21
        </h2>
        <PrivacyActions userId={user.id} canExportOthers={user.role === "ADMIN"} />
      </div>

      {/* ── Retention Schedule ────────────────────────────── */}
      <div className="rounded-2xl border border-border/40 bg-background/60 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/30">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Data Retention Schedule</h2>
          <span className="ml-auto text-[10px] text-muted-foreground">Auto-deletion timeline per category</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left w-1/2">Category</th>
                <th className="px-4 py-2.5 text-left">Retention</th>
                <th className="px-4 py-2.5 text-left hidden sm:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {RETENTION_ROWS.map((r, i) => (
                <tr key={i} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5 text-xs flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[r.priority]}`} />
                    {r.cat}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {r.ret}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/20 bg-muted/5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /> High priority / statutory</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Operational</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> UI / low priority</span>
        </div>
      </div>

      {/* ── What We Collect + Legal Bases ─────────────────── */}
      <div className="grid sm:grid-cols-2 gap-4">

        {/* Data categories */}
        <div className="rounded-2xl border border-border/40 bg-background/60 p-5 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" /> What We Collect
          </h2>
          <div className="space-y-2">
            {DATA_CATEGORIES.map((d, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/30 bg-muted/10 px-3 py-2.5">
                <span className="text-base shrink-0">{d.icon}</span>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{d.label}</div>
                  <div className="text-xs text-foreground/80 mt-0.5">{d.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legal bases */}
        <div className="rounded-2xl border border-border/40 bg-background/60 p-5 space-y-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" /> Legal Bases — PDPL Art. 5
          </h2>
          <div className="space-y-2">
            {LEGAL_BASES.map((l, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2.5 ${l.color.split(" ").slice(0, 2).join(" ")}`}>
                <div className={`text-[10px] uppercase tracking-wide font-semibold ${l.color.split(" ")[2]}`}>
                  {l.basis}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{l.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Standards Footer ──────────────────────────────── */}
      <div className="rounded-2xl border border-border/30 bg-muted/5 px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Applicable Standards & Regulations
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {[
            { code: "PDPL 2022",     name: "Oman Personal Data Protection Law",           detail: "Royal Decree 6/2022" },
            { code: "ISO 45001",     name: "Occupational Health & Safety Management",      detail: "2018 Edition" },
            { code: "MoEM Circular", name: "Ministry of Energy & Minerals Safety Records", detail: "Oman HSE Regulations" },
          ].map((s) => (
            <div key={s.code} className="rounded-lg border border-border/30 bg-background/40 px-3 py-2.5">
              <div className="text-[10px] font-mono text-primary font-semibold">{s.code}</div>
              <div className="text-xs mt-0.5">{s.name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.detail}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
