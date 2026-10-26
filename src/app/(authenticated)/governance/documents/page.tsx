"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, ExternalLink, CheckCheck, Loader2, Plus, X, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { ROLE_GROUPS } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

interface Document {
  id: string;
  title: string;
  category: string;
  status: string;
  fileUrl: string | null;
  version: string;
  requiresAcknowledgment: boolean;
  createdAt: string;
  site: { code: string; name: string } | null;
  uploadedBy: { name: string };
  _count: { acknowledgments: number };
}

const CATEGORIES = ["POLICY", "PROCEDURE", "JSA", "MOC", "CERTIFICATE", "PERMIT", "TRAINING", "OTHER"];

/** Only open https links (older records may hold anything). */
const safeUrl = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

export default function DocumentsPage() {
  const { t } = useI18n();
  const role = useSession().data?.user?.role as Role | undefined;
  const canAdd = !!role && ROLE_GROUPS.SAFETY.includes(role);

  const [items, setItems] = useState<Document[]>([]);
  const [category, setCategory] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("category", category);
    const r = await fetch(`/api/documents?${params}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.documents ?? []);
    setLoading(false);
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const catLabel = (c: string) => {
    const key = `governance.documents.categories.${c}` as MessageKey;
    const label = t(key);
    return label === key ? c : label;
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><FileText className="h-6 w-6 text-primary" /> {t("governance.documents.title")}</span>}
        description={t("governance.documents.subtitle")}
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t("governance.common.refresh")} onClick={load}><RefreshCw /></Button>
            {canAdd && (
              <Button variant={showNew ? "outline" : "default"} onClick={() => setShowNew((v) => !v)}>
                {showNew ? <><X /> {t("governance.common.cancel")}</> : <><Plus /> {t("governance.documents.new")}</>}
              </Button>
            )}
          </>
        }
      />

      {showNew && <NewDocumentForm onDone={() => { setShowNew(false); load(); }} />}

      <div className="flex flex-wrap gap-2">
        {["ALL", ...CATEGORIES].map((c) => (
          <Button key={c} variant={category === c ? "default" : "outline"} size="sm" onClick={() => setCategory(c)}>
            {c === "ALL" ? t("governance.common.all") : catLabel(c)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title={t("governance.documents.empty")} description={t("governance.documents.emptyHint")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((d) => {
            const url = safeUrl(d.fileUrl);
            return (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{d.title}</span>
                        <StatusBadge value={d.status} />
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{catLabel(d.category)}</span>
                        <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">v{d.version}</span>
                      </div>
                      {d.requiresAcknowledgment && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-warning">
                          <CheckCheck className="h-3.5 w-3.5" />
                          {t("governance.documents.needsAck", { n: d._count.acknowledgments })}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {d.site ? d.site.code : t("governance.documents.global")} · {t("governance.documents.by", { name: d.uploadedBy.name })}
                        </span>
                        {url && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" /> {t("governance.documents.open")}
                            </a>
                          </Button>
                        )}
                      </div>
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

function NewDocumentForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [sites, setSites] = useState<{ id: string; code: string; name: string }[]>([]);
  const [form, setForm] = useState({
    title: "", category: "PROCEDURE", version: "1.0", fileUrl: "", siteId: "", requiresAcknowledgment: false, publish: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((j) => j.ok && setSites(j.data.sites ?? []));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const r = await fetch("/api/documents", {
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
          <h2 className="text-sm font-semibold">{t("governance.documents.form.heading")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-title">{t("governance.documents.form.title")}</Label>
              <Input id="doc-title" required minLength={3} value={form.title} placeholder={t("governance.documents.form.titlePh")}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-cat">{t("governance.documents.form.category")}</Label>
              <NativeSelect id="doc-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`governance.documents.categories.${c}` as MessageKey)}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-ver">{t("governance.documents.form.version")}</Label>
              <Input id="doc-ver" required value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-url">{t("governance.documents.form.url")}</Label>
              <Input id="doc-url" type="url" dir="ltr" pattern="https://.*" value={form.fileUrl} placeholder={t("governance.documents.form.urlPh")}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-site">{t("governance.documents.form.site")}</Label>
              <NativeSelect id="doc-site" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">{t("governance.documents.form.allSites")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.requiresAcknowledgment} onChange={(e) => setForm({ ...form, requiresAcknowledgment: e.target.checked })} />
                {t("governance.documents.form.ack")}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />
                {t("governance.documents.form.publish")}
              </label>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onDone}>{t("governance.common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />} {t("governance.documents.form.create")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
