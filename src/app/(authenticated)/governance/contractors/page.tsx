"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Clock, ExternalLink, FileText, Loader2, Mail, Pencil, Phone, Plus, RefreshCw, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { TONE_EDGE, TONE_SOFT, TONE_TEXT, type Tone } from "@/lib/ui/tone";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/ui/empty-state";

interface Contractor {
  id: string;
  name: string;
  nameAr: string | null;
  companyName: string;
  specialty: string | null;
  specialtyAr: string | null;
  website: string | null;
  source: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  safetyRating: number;
  status: string;
  isAutoSuspended: boolean;
  contractStart: string | null;
  contractEnd: string | null;
  activePermitsCount: number;
}

const STATUSES = ["PREQUALIFICATION", "ACTIVE", "SUSPENDED", "EXPIRED"] as const;
type Filter = "ALL" | (typeof STATUSES)[number];

// The /governance section is ADMIN + HSSE_MANAGER only, the same roles that may edit.
const STATUS_TONE: Record<string, Tone> = { PREQUALIFICATION: "info", ACTIVE: "success", SUSPENDED: "danger", EXPIRED: "neutral" };
const SOON_MS = 30 * 864e5;

const isExpiringSoon = (c: Contractor) =>
  c.status === "ACTIVE" && !!c.contractEnd && new Date(c.contractEnd).getTime() - Date.now() < SOON_MS;

export default function ContractorsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Contractor[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Contractor | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/contractors", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setItems(j.data.contractors ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = filter === "ALL" ? items : items.filter((c) => c.status === filter);
  const count = (s: string) => items.filter((c) => c.status === s).length;

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={t("governance.contractors.title")}
        description={t("governance.contractors.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={load} aria-label={t("governance.contractors.refresh")}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />{t("governance.contractors.add")}</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("governance.contractors.kpi.prequal")} value={count("PREQUALIFICATION")} tone="info" />
        <Kpi label={t("governance.contractors.kpi.active")} value={count("ACTIVE")} tone="success" />
        <Kpi label={t("governance.contractors.kpi.suspended")} value={count("SUSPENDED")} tone="danger" />
        <Kpi label={t("governance.contractors.kpi.expiring")} value={items.filter(isExpiringSoon).length} tone="warning" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...STATUSES] as Filter[]).map((k) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="rounded-full" onClick={() => setFilter(k)}>
            {t(`governance.contractors.filter.${k}` as MessageKey)}
          </Button>
        ))}
        <span className="ms-auto text-xs text-muted-foreground">{t("governance.contractors.count", { n: shown.length })}</span>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("governance.contractors.loading")}
        </div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={Building2} title={t("governance.contractors.none")} description={t("governance.contractors.noneDesc")} /></Card>
      ) : shown.length === 0 ? (
        <Card><EmptyState icon={Building2} title={t("governance.contractors.noneFiltered")} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((c) => <ContractorCard key={c.id} c={c} onEdit={() => setEditing(c)} />)}
        </div>
      )}

      {editing && (
        <ContractorDialog
          contractor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ContractorCard({ c, onEdit }: { c: Contractor; onEdit: () => void }) {
  const { t, isAr } = useI18n();
  const f = useFormat();
  const soon = isExpiringSoon(c);
  const tone = STATUS_TONE[c.status] ?? "neutral";
  const ratingTone = c.safetyRating >= 4.5 ? "text-success" : c.safetyRating >= 3.5 ? "text-warning" : "text-danger";
  const day = (d: string) => f.date(d, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Card className={cn("border-s-4", TONE_EDGE[tone])}>
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{isAr && c.nameAr ? c.nameAr : c.name}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TONE_SOFT[tone])}>
                {t(`governance.contractors.status.${c.status}` as MessageKey)}
              </span>
              {c.isAutoSuspended && (
                <span className={cn("rounded px-1.5 py-0.5 text-[10px]", TONE_SOFT.danger)}>{t("governance.contractors.autoSuspended")}</span>
              )}
              {soon && <span className={cn("rounded px-1.5 py-0.5 text-[10px]", TONE_SOFT.warning)}>{t("governance.contractors.expiring")}</span>}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr" style={{ textAlign: isAr ? "right" : "left" }}>{c.companyName}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {c.safetyRating > 0 ? (
              <div className={cn("flex items-center gap-1", ratingTone)} title={t("governance.contractors.rating")}>
                <Star className="h-4 w-4" fill="currentColor" />
                <span className="font-mono text-sm font-bold">{c.safetyRating.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">{t("governance.contractors.notRated")}</span>
            )}
            {c.activePermitsCount > 0 && (
              <Link href="/operations/permits" className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", TONE_SOFT.info)}>
                <FileText className="h-3 w-3" /> {t("governance.contractors.permits", { n: c.activePermitsCount })}
              </Link>
            )}
          </div>
        </div>

        {(c.specialty || c.specialtyAr) && (
          <p className="text-xs leading-relaxed text-muted-foreground" dir="auto">{(isAr && c.specialtyAr) || c.specialty || c.specialtyAr}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {c.website && (
            <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="h-3 w-3" /> {t("governance.contractors.website")}
            </a>
          )}
          {c.contactEmail && <span className="flex items-center gap-1" dir="ltr"><Mail className="h-3 w-3" /> {c.contactEmail}</span>}
          {c.contactPhone && <span className="flex items-center gap-1" dir="ltr"><Phone className="h-3 w-3" /> {c.contactPhone}</span>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          {c.contractStart ? (
            <span className={cn("flex items-center gap-1", soon && "text-warning")}>
              <Clock className="h-3 w-3" />
              {t("governance.contractors.start", { date: day(c.contractStart) })}
              {c.contractEnd && <> · {t("governance.contractors.end", { date: day(c.contractEnd) })}</>}
            </span>
          ) : (
            <span>{t("governance.contractors.noContract")}</span>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}>
            <Pencil className="h-3 w-3" /> {t("governance.contractors.edit")}
          </Button>
        </div>
        {c.source && <div className="text-[10px] text-muted-foreground/70">{t("governance.contractors.source", { source: c.source })}</div>}
      </CardContent>
    </Card>
  );
}

const toDateInput = (d: string | null) => (d ? d.slice(0, 10) : "");

function ContractorDialog({ contractor, onClose, onSaved }: { contractor: Contractor | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: contractor?.name ?? "",
    nameAr: contractor?.nameAr ?? "",
    companyName: contractor?.companyName ?? "",
    specialty: contractor?.specialty ?? "",
    specialtyAr: contractor?.specialtyAr ?? "",
    website: contractor?.website ?? "",
    contactEmail: contractor?.contactEmail ?? "",
    contactPhone: contractor?.contactPhone ?? "",
    status: contractor?.status ?? "PREQUALIFICATION",
    safetyRating: String(contractor?.safetyRating ?? 0),
    contractStart: toDateInput(contractor?.contractStart ?? null),
    contractEnd: toDateInput(contractor?.contractEnd ?? null),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.status === "ACTIVE" && !form.contractStart) { setError(t("governance.contractors.form.activeNeedsStart")); return; }
    setError(null); setBusy(true);
    const body = { ...form, safetyRating: Number(form.safetyRating) || 0, ...(contractor ? { id: contractor.id } : {}) };
    const r = await fetch("/api/contractors", {
      method: contractor ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) onSaved(); else setError(r?.error?.message ?? t("governance.contractors.form.failed"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Card className="max-h-[90vh] w-full overflow-y-auto">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {contractor ? t("governance.contractors.form.editTitle", { name: contractor.name }) : t("governance.contractors.form.createTitle")}
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("governance.contractors.form.close")}><X /></Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("governance.contractors.form.name")} value={form.name} onChange={set("name")} required />
                <Field label={t("governance.contractors.form.nameAr")} value={form.nameAr} onChange={set("nameAr")} />
              </div>
              <Field label={t("governance.contractors.form.companyName")} value={form.companyName} onChange={set("companyName")} required ltr />
              <Field label={t("governance.contractors.form.specialty")} value={form.specialty} onChange={set("specialty")} ltr />
              <Field label={t("governance.contractors.form.specialtyAr")} value={form.specialtyAr} onChange={set("specialtyAr")} />
              <Field label={t("governance.contractors.form.website")} type="url" value={form.website} onChange={set("website")} ltr />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("governance.contractors.form.email")} type="email" value={form.contactEmail} onChange={set("contactEmail")} ltr />
                <Field label={t("governance.contractors.form.phone")} value={form.contactPhone} onChange={set("contactPhone")} ltr />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("governance.contractors.form.status")}</Label>
                  <NativeSelect value={form.status} onChange={(e) => set("status")(e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`governance.contractors.status.${s}` as MessageKey)}</option>)}
                  </NativeSelect>
                </div>
                <Field label={t("governance.contractors.form.rating")} type="number" step="0.1" min="0" max="5" value={form.safetyRating} onChange={set("safetyRating")} ltr />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("governance.contractors.form.contractStart")} type="date" value={form.contractStart} onChange={set("contractStart")} ltr />
                <Field label={t("governance.contractors.form.contractEnd")} type="date" value={form.contractEnd} onChange={set("contractEnd")} ltr />
              </div>
              {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>{t("governance.contractors.form.cancel")}</Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {contractor ? t("governance.contractors.form.save") : t("governance.contractors.form.create")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, ltr, ...rest }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; ltr?: boolean;
  step?: string; min?: string; max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} dir={ltr ? "ltr" : undefined} {...rest} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={cn("rounded-xl border p-4", value > 0 ? "border-border" : "border-border/40")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 text-2xl font-semibold tabular-nums", value > 0 ? TONE_TEXT[tone] : "text-muted-foreground")}>
        {value}
      </div>
    </div>
  );
}
