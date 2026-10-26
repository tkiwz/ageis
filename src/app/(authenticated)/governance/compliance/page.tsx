"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FileCheck, Plus, X, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock, Lock, RotateCcw, MapPin, User } from "lucide-react";
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

interface ComplianceItem {
  id:              string;
  title:           string;
  regulationRef:   string;
  status:          string;
  dueDate:         string;
  isAutoEscalated: boolean;
  triggersLockdown:boolean;
  site:        { code: string; name: string };
  responsible: { id: string; name: string; role: string };
}

type Filter = "ALL" | "PENDING" | "COMPLIANT" | "OVERDUE";
const FILTERS: Filter[] = ["ALL", "PENDING", "COMPLIANT", "OVERDUE"];

export default function CompliancePage() {
  const { t } = useI18n();
  const session = useSession().data?.user;
  const role = session?.role as Role | undefined;
  const isManager = !!role && ROLE_GROUPS.MANAGE.includes(role);
  const isSafety  = !!role && ROLE_GROUPS.SAFETY.includes(role);

  const [items,   setItems]   = useState<ComplianceItem[]>([]);
  const [filter,  setFilter]  = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy,    setBusy]    = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "ALL") p.set("status", filter);
    const r = await fetch(`/api/compliance/items?${p}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.items ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const now = Date.now();
  const isOverdue = (i: ComplianceItem) => i.status === "OVERDUE" || (i.status === "PENDING" && new Date(i.dueDate).getTime() < now);
  const counts = {
    pending:   items.filter((i) => i.status === "PENDING" && !isOverdue(i)).length,
    compliant: items.filter((i) => i.status === "COMPLIANT").length,
    overdue:   items.filter(isOverdue).length,
    lockdown:  items.filter((i) => i.triggersLockdown).length,
  };

  async function setStatus(item: ComplianceItem, status: "COMPLIANT" | "PENDING" | "EXEMPT") {
    let note: string | undefined;
    if (status !== "PENDING") {
      note = window.prompt(t(status === "COMPLIANT" ? "governance.compliance.evidencePrompt" : "governance.compliance.exemptPrompt"))?.trim();
      if (!note) return;
    }
    setBusy(item.id);
    const r = await fetch(`/api/compliance/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) window.alert(j?.error?.message ?? t("governance.common.failed"));
    setBusy(null);
    loadItems();
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><FileCheck className="h-6 w-6 text-primary" /> {t("governance.compliance.title")}</span>}
        description={t("governance.compliance.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t("governance.common.refresh")} onClick={loadItems}><RefreshCw /></Button>
            {isManager && (
              <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
                {showNew ? <><X /> {t("governance.common.cancel")}</> : <><Plus /> {t("governance.compliance.new")}</>}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t("governance.compliance.kpi.pending")}   value={counts.pending}   tone="text-warning" />
        <Kpi label={t("governance.compliance.kpi.compliant")} value={counts.compliant} tone="text-success" />
        <Kpi label={t("governance.compliance.kpi.overdue")}   value={counts.overdue}   tone="text-danger" />
        <Kpi label={t("governance.compliance.kpi.lockdown")}  value={counts.lockdown}  tone="text-danger" />
      </div>

      {showNew && <NewItemForm onDone={() => { setShowNew(false); loadItems(); }} />}

      <FilterTabs value={filter} onChange={setFilter} />

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileCheck} title={t("governance.compliance.empty")} description={t("governance.compliance.emptyHint")} />
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <ComplianceCard
              key={item.id}
              item={item}
              overdue={isOverdue(item)}
              busy={busy === item.id}
              canComplete={isSafety || item.responsible.id === session?.id}
              canManage={isManager}
              onStatus={(s) => setStatus(item, s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTabs({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {FILTERS.map((v) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm transition-colors",
            value === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
          )}>
          {t(`governance.compliance.filter.${v}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

function ComplianceCard({ item, overdue, busy, canComplete, canManage, onStatus }: {
  item: ComplianceItem; overdue: boolean; busy: boolean; canComplete: boolean; canManage: boolean;
  onStatus: (s: "COMPLIANT" | "PENDING" | "EXEMPT") => void;
}) {
  const { t } = useI18n();
  const f = useFormat();
  const due = new Date(item.dueDate);
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / 864e5);
  const status = overdue ? "OVERDUE" : item.status;
  const open = item.status === "PENDING" || item.status === "OVERDUE";

  return (
    <Card className={cn("border-s-4", TONE_EDGE[toneFor(status)])}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {status === "COMPLIANT" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            : status === "OVERDUE" ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
            : <Clock className="h-4 w-4 shrink-0 text-warning" />}
          <span className="text-sm font-semibold">{item.title}</span>
          <StatusBadge value={status} />
          {item.triggersLockdown && (
            <span className="flex items-center gap-1 rounded-md bg-danger/12 px-1.5 py-0.5 text-xs text-danger">
              <Lock className="h-3 w-3" /> {t("governance.compliance.lockdown")}
            </span>
          )}
          {item.isAutoEscalated && (
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{t("governance.compliance.autoEsc")}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{item.regulationRef}</span>
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.site.code}</span>
          <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {item.responsible.name}</span>
          {open && (
            <span className={cn("flex items-center gap-1 font-medium",
              status === "OVERDUE" ? "text-danger" : daysLeft <= 14 ? "text-warning" : "")}>
              <Clock className="h-3.5 w-3.5" />
              {status === "OVERDUE"
                ? t("governance.compliance.overdueBy", { n: Math.abs(daysLeft) })
                : t("governance.compliance.due", { date: f.date(item.dueDate), n: daysLeft })}
            </span>
          )}
          <div className="ms-auto flex flex-wrap gap-2">
            {open && canComplete && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("COMPLIANT")}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {t("governance.compliance.markDone")}
              </Button>
            )}
            {open && canManage && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("EXEMPT")}>
                {t("governance.compliance.exempt")}
              </Button>
            )}
            {!open && canManage && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("PENDING")}>
                <RotateCcw /> {t("governance.compliance.reopen")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewItemForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [sites, setSites] = useState<{ id: string; code: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [form, setForm] = useState({ title: "", regulationRef: "", dueDate: "", siteId: "", responsibleId: "", triggersLockdown: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((j) => j.ok && setSites(Array.isArray(j.data) ? j.data : (j.data.sites ?? [])));
    fetch("/api/tasks?members=1").then((r) => r.json()).then((j) => j.ok && setUsers(j.data.users ?? []));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const r = await fetch("/api/compliance/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dueDate: new Date(form.dueDate).toISOString() }),
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
          <h2 className="text-sm font-semibold">{t("governance.compliance.form.heading")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ci-title">{t("governance.compliance.form.title")}</Label>
              <Input id="ci-title" required minLength={3} value={form.title} placeholder={t("governance.compliance.form.titlePh")}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-ref">{t("governance.compliance.form.ref")}</Label>
              <Input id="ci-ref" required minLength={2} value={form.regulationRef} placeholder={t("governance.compliance.form.refPh")}
                onChange={(e) => setForm({ ...form, regulationRef: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-due">{t("governance.compliance.form.due")}</Label>
              <Input id="ci-due" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-site">{t("governance.common.site")}</Label>
              <NativeSelect id="ci-site" required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">{t("governance.common.sitePh")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-resp">{t("governance.compliance.form.responsible")}</Label>
              <NativeSelect id="ci-resp" required value={form.responsibleId} onChange={(e) => setForm({ ...form, responsibleId: e.target.value })}>
                <option value="">{t("governance.compliance.form.responsiblePh")}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({t(`roles.${u.role}` as MessageKey)})</option>)}
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.triggersLockdown} onChange={(e) => setForm({ ...form, triggersLockdown: e.target.checked })} />
              {t("governance.compliance.form.lockdown")}
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onDone}>{t("governance.common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />} {t("governance.compliance.form.create")}</Button>
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
