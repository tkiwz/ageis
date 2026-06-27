"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, UserCog, Loader2, Shield, X } from "lucide-react";

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
}

interface Site { id: string; code: string; name: string }
interface Grant {
  id: string;
  userId: string;
  siteId: string;
  accessLevel: string;
  site: Site | null;
}

const ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"];

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const [u, s] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/sites").then((r) => r.json()),
      ]);
      if (u.ok) setUsers(u.data.users);
      if (s.ok) setSites(s.data ?? []);
    });
  }

  async function loadGrants(userId: string) {
    const r = await fetch(`/api/admin/site-access?userId=${userId}`);
    const j = await r.json();
    if (j.ok) setGrants(j.data.grants);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selectedUser) loadGrants(selectedUser.id);
    else setGrants([]);
  }, [selectedUser]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q)
      || u.name.toLowerCase().includes(q)
      || u.role.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New user
        </Button>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No users found.</CardContent></Card>
        ) : (
          filtered.map((u) => (
            <Card key={u.id} className={`glass ${!u.isActive ? "opacity-50" : ""}`}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                    {!u.isActive && <Badge variant="outline" className="text-[10px] text-destructive">INACTIVE</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.email} · {u.department ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {u.lastLoginAt ? `Last: ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Never logged in"}
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedUser(u)}>
                  <UserCog className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {creating && (
        <CreateUserDialog
          sites={sites}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
      {selectedUser && (
        <EditUserDialog
          user={selectedUser}
          sites={sites}
          grants={grants}
          onClose={() => setSelectedUser(null)}
          onChanged={() => { load(); if (selectedUser) loadGrants(selectedUser.id); }}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  sites, onClose, onCreated,
}: { sites: Site[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    email: "", password: "", name: "", role: "OPERATOR", department: "", phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error?.message ?? "Failed"); setBusy(false); return; }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">New user</CardTitle>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Password (≥6 chars)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <div>
            <Label>Role</Label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Field label="Department (optional)" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
          <Field label="Phone (optional)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            After creation: open the user&apos;s edit dialog to grant per-site access.
            <span className="ml-2 opacity-50">·</span>
            Sites loaded: {sites.length}
          </p>
        </CardContent>
      </Card>
    </Backdrop>
  );
}

function EditUserDialog({
  user, sites, grants, onClose, onChanged,
}: { user: User; sites: Site[]; grants: Grant[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    department: user.department ?? "",
    phone: user.phone ?? "",
    password: "",
    isActive: user.isActive,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: user.id, name: form.name, role: form.role,
        department: form.department || null, phone: form.phone || null,
        isActive: form.isActive, password: form.password || undefined,
      }),
    });
    setBusy(false);
    if ((await r.json()).ok) { onChanged(); onClose(); }
  }

  async function grant(siteId: string) {
    const r = await fetch("/api/admin/site-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, siteId, accessLevel: "READ" }),
    });
    if ((await r.json()).ok) onChanged();
  }

  async function revoke(siteId: string) {
    const r = await fetch(`/api/admin/site-access?userId=${user.id}&siteId=${siteId}`, { method: "DELETE" });
    if ((await r.json()).ok) onChanged();
  }

  const grantedIds = new Set(grants.map((g) => g.siteId));
  const ungranted = sites.filter((s) => !grantedIds.has(s.id));

  return (
    <Backdrop onClose={onClose}>
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card z-10">
          <CardTitle className="text-base">Edit {user.email}</CardTitle>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <div>
            <Label>Role</Label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Field label="Department" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="New password (leave empty to keep)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
            <div>
              <div className="text-sm">Active</div>
              <div className="text-xs text-muted-foreground">Deactivated users cannot sign in</div>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
          </div>

          <div className="border-t border-border/40 pt-3">
            <div className="mb-2 flex items-center gap-1 text-sm font-semibold">
              <Shield className="h-3.5 w-3.5" /> Site Access
            </div>
            {grants.length === 0 ? (
              <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-xs text-muted-foreground">
                No site grants. {user.role === "ADMIN" || user.role === "HSSE_MANAGER" ? "(this role has unrestricted access)" : "User won't see any data — grant at least one site."}
              </div>
            ) : (
              <div className="space-y-1">
                {grants.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-md border border-border/40 px-2 py-1.5 text-sm">
                    <span>{g.site?.code} — {g.site?.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => revoke(g.siteId)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {ungranted.length > 0 && (
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Grant access to…</Label>
                <select
                  onChange={(e) => { if (e.target.value) { grant(e.target.value); e.target.value = ""; } }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="">— select site —</option>
                  {ungranted.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
