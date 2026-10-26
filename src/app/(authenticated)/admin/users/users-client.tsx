"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, MapPin, Plus, Search, Shield, UserCog, X } from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import { TONE_SOFT } from "@/lib/ui/tone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  siteCount: number;
}
interface Site { id: string; code: string; name: string; nameAr?: string | null }
interface Grant { id: string; userId: string; siteId: string; accessLevel: string; site: Site | null }

const ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"];
/** These roles see every site (see lib/site-access). */
const UNRESTRICTED = new Set(["ADMIN", "HSSE_MANAGER"]);

/** 16 characters with every class, from the browser's CSPRNG. */
function generatePassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*-_=+?"];
  const all = sets.join("");
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = [...sets.map(pick), ...Array.from({ length: 12 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function UsersClient() {
  const { t } = useI18n();
  const f = useFormat();
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);

  const load = useCallback(async () => {
    const [u, s] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
    ]);
    if (u.ok) setUsers(u.data.users);
    if (s.ok) setSites(Array.isArray(s.data) ? s.data : (s.data.sites ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const roleLabel = (r: string) => t(`roles.${r}` as MessageKey);
  const filtered = users.filter((u) => {
    if (!showInactive && !u.isActive) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || roleLabel(u.role).toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("admin.users.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="ps-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          {t("admin.users.showInactive")}
        </label>
        <Button onClick={() => setCreating(true)} className="ms-auto">
          <Plus /> {t("admin.users.new")}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={UserCog} title={t("admin.users.none")} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((u) => {
            const unrestricted = UNRESTRICTED.has(u.role);
            return (
              <Card key={u.id} className={cn(!u.isActive && "opacity-60")}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{u.name}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{roleLabel(u.role)}</span>
                      {!u.isActive && <span className={cn("rounded-md px-1.5 py-0.5 text-xs", TONE_SOFT.danger)}>{t("admin.users.inactive")}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground" dir="auto">
                      <span dir="ltr">{u.email}</span>{u.department ? ` · ${u.department}` : ""}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {unrestricted
                        ? <span className="text-muted-foreground">{t("admin.users.allSites")}</span>
                        : u.siteCount > 0
                          ? <span className="text-muted-foreground">{t("admin.users.sites", { n: u.siteCount })}</span>
                          : <span className="text-warning">{t("admin.users.noSites")}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.lastLoginAt ? t("admin.users.lastLogin", { date: f.date(u.lastLoginAt) }) : t("admin.users.neverLoggedIn")}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(u)}>
                    <UserCog /> {t("admin.users.edit")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {creating && <CreateUserDialog sites={sites} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {selected && <EditUserDialog user={selected} sites={sites} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function PasswordField({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" className="font-mono" autoComplete="new-password" required={!allowEmpty} />
        <Button type="button" variant="outline" onClick={() => { onChange(generatePassword()); setCopied(false); }}>
          <KeyRound /> {t("admin.users.form.generate")}
        </Button>
        {value && (
          <Button type="button" variant="outline" size="icon" aria-label={t("admin.users.form.copy")}
            onClick={() => { navigator.clipboard.writeText(value); setCopied(true); }}>
            {copied ? <Check /> : <Copy />}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("admin.users.form.passwordHint")}</p>
    </div>
  );
}

function SitePicker({ sites, value, onChange }: { sites: Site[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  const { t, isAr } = useI18n();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{t("admin.users.form.sites")}</Label>
        <span className="flex gap-2 text-xs">
          <button type="button" className="text-primary hover:underline" onClick={() => onChange(new Set(sites.map((s) => s.id)))}>{t("admin.users.form.selectAll")}</button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange(new Set())}>{t("admin.users.form.clear")}</button>
        </span>
      </div>
      <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
        {sites.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
            <input type="checkbox" checked={value.has(s.id)} onChange={(e) => {
              const next = new Set(value);
              if (e.target.checked) next.add(s.id); else next.delete(s.id);
              onChange(next);
            }} />
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">{s.code}</span>
            <span>{isAr && s.nameAr ? s.nameAr : s.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CreateUserDialog({ sites, onClose, onCreated }: { sites: Site[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "OPERATOR", department: "", phone: "" });
  const [siteIds, setSiteIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unrestricted = UNRESTRICTED.has(form.role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, siteIds: unrestricted ? [] : [...siteIds] }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) onCreated(); else setError(r?.error?.message ?? t("admin.users.form.failed"));
  }

  return (
    <Backdrop onClose={onClose}>
      <Card className="max-h-[90vh] w-full overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("admin.users.form.createTitle")}</CardTitle>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("admin.users.form.close")}><X /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Field label={t("admin.users.form.name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label={t("admin.users.form.email")} type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required ltr />
            <RoleSelect value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
            <PasswordField label={t("admin.users.form.password")} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            {unrestricted
              ? <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t("admin.users.form.sitesUnrestricted")}</p>
              : <SitePicker sites={sites} value={siteIds} onChange={setSiteIds} />}
            <Field label={t("admin.users.form.department")} value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <Field label={t("admin.users.form.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} ltr />
            {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("admin.users.form.cancel")}</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{t("admin.users.form.create")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Backdrop>
  );
}

function EditUserDialog({ user, sites, onClose, onChanged }: { user: User; sites: Site[]; onClose: () => void; onChanged: () => void }) {
  const { t, isAr } = useI18n();
  const [form, setForm] = useState({
    name: user.name, role: user.role, department: user.department ?? "", phone: user.phone ?? "", password: "", isActive: user.isActive,
  });
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    const j = await fetch(`/api/admin/site-access?userId=${user.id}`).then((r) => r.json()).catch(() => null);
    if (j?.ok) setGrants(j.data.grants);
  }, [user.id]);
  useEffect(() => { loadGrants(); }, [loadGrants]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id, name: form.name, role: form.role,
        department: form.department || null, phone: form.phone || null,
        isActive: form.isActive, password: form.password || undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) { onChanged(); onClose(); } else setError(r?.error?.message ?? t("admin.users.form.failed"));
  }

  async function grant(siteId: string) {
    const r = await fetch("/api/admin/site-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, siteId, accessLevel: "WRITE" }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { loadGrants(); onChanged(); } else setError(r?.error?.message ?? t("admin.users.form.failed"));
  }
  async function revoke(siteId: string) {
    const r = await fetch(`/api/admin/site-access?userId=${user.id}&siteId=${siteId}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { loadGrants(); onChanged(); }
  }

  const granted = useMemo(() => new Set(grants.map((g) => g.siteId)), [grants]);
  const ungranted = sites.filter((s) => !granted.has(s.id));
  const siteName = (s: Site | null) => (s ? (isAr && s.nameAr ? s.nameAr : s.name) : "");

  return (
    <Backdrop onClose={onClose}>
      <Card className="max-h-[90vh] w-full overflow-y-auto">
        <CardHeader className="sticky top-0 z-10 flex flex-row items-center justify-between bg-card">
          <CardTitle className="text-base" dir="auto">{t("admin.users.form.editTitle", { email: user.email })}</CardTitle>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("admin.users.form.close")}><X /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <Field label={t("admin.users.form.name")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <RoleSelect value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
            <Field label={t("admin.users.form.department")} value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <Field label={t("admin.users.form.phone")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} ltr />
            <PasswordField label={t("admin.users.form.newPassword")} value={form.password} onChange={(v) => setForm({ ...form, password: v })} allowEmpty />
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm">{t("admin.users.form.active")}</div>
                <div className="text-xs text-muted-foreground">{t("admin.users.form.activeHint")}</div>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>

            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1 text-sm font-semibold"><Shield className="h-3.5 w-3.5" /> {t("admin.users.form.siteAccess")}</div>
              {UNRESTRICTED.has(form.role) ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t("admin.users.form.sitesUnrestricted")}</p>
              ) : (
                <>
                  {grants.length === 0
                    ? <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t("admin.users.noSites")}</p>
                    : (
                      <div className="space-y-1">
                        {grants.map((g) => (
                          <div key={g.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                            <span><span className="font-mono text-xs text-muted-foreground" dir="ltr">{g.site?.code}</span> {siteName(g.site)}</span>
                            <Button type="button" size="sm" variant="ghost" onClick={() => revoke(g.siteId)} aria-label={t("admin.users.form.remove")}><X /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                  {ungranted.length > 0 && (
                    <NativeSelect className="mt-2" defaultValue="" onChange={(e) => { if (e.target.value) { grant(e.target.value); e.target.value = ""; } }}>
                      <option value="">{t("admin.users.form.addSite")}</option>
                      {ungranted.map((s) => <option key={s.id} value={s.id}>{s.code} — {siteName(s)}</option>)}
                    </NativeSelect>
                  )}
                </>
              )}
            </div>

            {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>{t("admin.users.form.close")}</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{t("admin.users.form.save")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Backdrop>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <Label>{t("admin.users.form.role")}</Label>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}` as MessageKey)}</option>)}
      </NativeSelect>
    </div>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, ltr }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; ltr?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} dir={ltr ? "ltr" : undefined} />
    </div>
  );
}
