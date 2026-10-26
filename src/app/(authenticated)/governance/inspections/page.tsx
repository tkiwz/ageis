"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ClipboardList, Loader2, Plus, X, RefreshCw, CheckCircle2, AlertTriangle, XCircle, PlusCircle, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { ROLE_GROUPS } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { TONE_EDGE, toneFor } from "@/lib/ui/tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

interface Inspection {
  id:            string;
  title:         string;
  type:          string;
  status:        string;
  fraudDetected: boolean;
  fraudReason:   string | null;
  conductedAt:   string | null;
  notes:         string | null;
  createdAt:     string;
  site:        { code: string; name: string };
  conductedBy: { name: string; role: string };
}

type Filter = "ALL" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
const FILTERS: Filter[] = ["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED"];
const TYPES = ["FIRE_SAFETY", "ELECTRICAL", "MECHANICAL", "HOUSEKEEPING", "PPE", "ENVIRONMENTAL", "PROCESS_SAFETY", "SITE_SAFETY"];

export default function InspectionsPage() {
  const { t } = useI18n();
  const f = useFormat();
  const role = useSession().data?.user?.role as Role | undefined;
  const isSafety = !!role && ROLE_GROUPS.SAFETY.includes(role);

  const [items,    setItems]    = useState<Inspection[]>([]);
  const [filter,   setFilter]   = useState<Filter>("ALL");
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [busy,     setBusy]     = useState<string | null>(null);
  const [created,  setCreated]  = useState<Record<string, string>>({}); // inspectionId → incidentId

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/inspections?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.inspections ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const counts = {
    scheduled:  items.filter((i) => i.status === "SCHEDULED").length,
    inProgress: items.filter((i) => i.status === "IN_PROGRESS").length,
    completed:  items.filter((i) => i.status === "COMPLETED").length,
    failed:     items.filter((i) => i.status === "FAILED").length,
    fraud:      items.filter((i) => i.fraudDetected).length,
  };

  async function finish(ins: Inspection, result: "PASSED" | "FAILED") {
    const input = window.prompt(t(result === "PASSED" ? "governance.inspections.passPrompt" : "governance.inspections.failPrompt"));
    if (input === null) return;
    const notes = input.trim();
    if (result === "FAILED" && !notes) return;
    setBusy(ins.id);
    const r = await fetch(`/api/inspections/${ins.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, notes: notes || undefined }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) window.alert(j?.error?.message ?? t("governance.common.failed"));
    setBusy(null);
    loadItems();
  }

  async function createIncident(ins: Inspection) {
    setBusy(ins.id);
    const r = await fetch(`/api/inspections/${ins.id}/create-incident`, { method: "POST" });
    const j = await r.json().catch(() => null);
    if (j?.ok) setCreated((prev) => ({ ...prev, [ins.id]: j.data.incidentId }));
    else window.alert(j?.error?.message ?? t("governance.common.failed"));
    setBusy(null);
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><ClipboardList className="h-6 w-6 text-primary" /> {t("governance.inspections.title")}</span>}
        description={t("governance.inspections.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t("governance.common.refresh")} onClick={loadItems}><RefreshCw /></Button>
            {isSafety && (
              <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
                {showNew ? <><X /> {t("governance.common.cancel")}</> : <><Plus /> {t("governance.inspections.new")}</>}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label={t("governance.inspections.kpi.scheduled")}  value={counts.scheduled}  tone="text-info" />
        <Kpi label={t("governance.inspections.kpi.inProgress")} value={counts.inProgress} tone="text-warning" />
        <Kpi label={t("governance.inspections.kpi.completed")}  value={counts.completed}  tone="text-success" />
        <Kpi label={t("governance.inspections.kpi.failed")}     value={counts.failed}     tone="text-danger" />
        <Kpi label={t("governance.inspections.kpi.fraud")}      value={counts.fraud}      tone="text-danger" />
      </div>

      {showNew && <NewInspectionForm onDone={() => { setShowNew(false); loadItems(); }} />}

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              filter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
            )}>
            {t(`governance.inspections.filter.${v}` as MessageKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("governance.inspections.empty")} description={t("governance.inspections.emptyHint")} />
      ) : (
        <div className="space-y-2.5">
          {items.map((ins) => {
            const open = ins.status === "SCHEDULED" || ins.status === "IN_PROGRESS";
            return (
              <Card key={ins.id} className={cn("border-s-4", TONE_EDGE[toneFor(ins.status === "COMPLETED" ? "OK" : ins.status)])}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{ins.title}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t(`governance.inspections.types.${ins.type}` as MessageKey)}
                    </span>
                    <StatusBadge value={ins.status} />
                    {ins.fraudDetected && (
                      <span className="flex items-center gap-1 rounded-md bg-danger/12 px-1.5 py-0.5 text-xs text-danger">
                        <AlertTriangle className="h-3 w-3" /> {t("governance.inspections.fraud")}
                      </span>
                    )}
                    {ins.status === "COMPLETED" && !ins.fraudDetected && (
                      <span className="flex items-center gap-1 rounded-md bg-success/12 px-1.5 py-0.5 text-xs text-success">
                        <CheckCircle2 className="h-3 w-3" /> {t("governance.inspections.verified")}
                      </span>
                    )}
                  </div>

                  {ins.fraudReason && (
                    <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                      <span className="font-semibold">{t("governance.inspections.fraudReason")} </span>{ins.fraudReason}
                    </div>
                  )}
                  {ins.notes && !ins.fraudReason && <p className="line-clamp-2 text-sm text-muted-foreground">{ins.notes}</p>}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {ins.site.code} — {ins.site.name}</span>
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {ins.conductedBy.name}</span>
                    <span>
                      {ins.conductedAt
                        ? t("governance.inspections.completedOn", { date: f.date(ins.conductedAt) })
                        : t("governance.inspections.scheduledOn", { date: f.date(ins.createdAt) })}
                    </span>
                    <div className="ms-auto flex flex-wrap gap-2">
                      {open && isSafety && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === ins.id} onClick={() => finish(ins, "PASSED")}>
                            {busy === ins.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {t("governance.inspections.pass")}
                          </Button>
                          <Button size="sm" variant="outline" className="text-danger" disabled={busy === ins.id} onClick={() => finish(ins, "FAILED")}>
                            <XCircle /> {t("governance.inspections.fail")}
                          </Button>
                        </>
                      )}
                      {ins.status === "FAILED" && isSafety && (
                        created[ins.id] ? (
                          <Link href={`/safety/incidents/${created[ins.id]}`} className="inline-flex items-center gap-1.5 rounded-md bg-success/12 px-2.5 py-1 text-xs text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t("governance.inspections.incidentCreated")}
                          </Link>
                        ) : (
                          <Button size="sm" variant="outline" className="text-danger" disabled={busy === ins.id} onClick={() => createIncident(ins)}>
                            {busy === ins.id ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                            {busy === ins.id ? t("governance.inspections.creating") : t("governance.inspections.createIncident")}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewInspectionForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [sites, setSites] = useState<{ id: string; code: string; name: string }[]>([]);
  const [form, setForm] = useState({ title: "", type: "FIRE_SAFETY", siteId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((j) => j.ok && setSites(j.data.sites ?? []));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const r = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json().catch(() => null);
    setSaving(false);
    if (j?.ok) onDone();
    else setError(j?.error?.message ?? t("governance.common.failed"));
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-sm font-semibold">{t("governance.inspections.form.heading")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="in-title">{t("governance.inspections.form.title")}</Label>
              <Input id="in-title" required minLength={3} value={form.title} placeholder={t("governance.inspections.form.titlePh")}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-type">{t("governance.inspections.form.type")}</Label>
              <NativeSelect id="in-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((v) => <option key={v} value={v}>{t(`governance.inspections.types.${v}` as MessageKey)}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-site">{t("governance.common.site")}</Label>
              <NativeSelect id="in-site" required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">{t("governance.common.sitePh")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </NativeSelect>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onDone}>{t("governance.common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />} {t("governance.inspections.form.create")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("num mt-1 text-2xl font-semibold", value > 0 ? tone : "text-muted-foreground")}>{value}</div>
      </CardContent>
    </Card>
  );
}
