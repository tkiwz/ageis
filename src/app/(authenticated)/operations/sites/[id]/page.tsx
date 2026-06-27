"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";

export default function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    status: "ACTIVE",
    riskLevel: "LOW",
    latitude: "",
    longitude: "",
    capacity: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sites/${id}`, { credentials: "include" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error?.message ?? "Failed to load");
        const s = json.data;
        setCode(s.code);
        setForm({
          name: s.name ?? "",
          nameAr: s.nameAr ?? "",
          status: s.status ?? "ACTIVE",
          riskLevel: s.riskLevel ?? "LOW",
          latitude: s.latitude?.toString() ?? "",
          longitude: s.longitude?.toString() ?? "",
          capacity: s.capacity?.toString() ?? "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          nameAr: form.nameAr.trim() || null,
          status: form.status,
          riskLevel: form.riskLevel,
          latitude: form.latitude ? parseFloat(form.latitude) : null,
          longitude: form.longitude ? parseFloat(form.longitude) : null,
          capacity: form.capacity ? parseInt(form.capacity, 10) : null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");

      router.push("/operations/sites");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete site ${code}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sites/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Failed");
      router.push("/operations/sites");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-6 py-6">
      <Link href="/operations/sites" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ChevronLeft className="h-3 w-3" />
        Back to Sites
      </Link>

      <Card className="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Edit Site</CardTitle>
            <span className="num text-xs text-muted-foreground">{code}</span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="name">Name (English) *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nameAr">Name (Arabic)</Label>
              <Input
                id="nameAr"
                dir="rtl"
                value={form.nameAr}
                onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SHUTDOWN">Shutdown</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="riskLevel">Risk Level</Label>
                <select
                  id="riskLevel"
                  value={form.riskLevel}
                  onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" type="number" step="0.0001"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" type="number" step="0.0001"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cap">Capacity</Label>
                <Input id="cap" type="number"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-risk-critical/40 bg-risk-critical/5 p-3 text-sm text-risk-critical">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting}
                className="text-risk-critical hover:bg-risk-critical/10">
                {deleting ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</>
                )}
              </Button>
              <div className="flex items-center gap-2">
                <Link href="/operations/sites">
                  <Button type="button" variant="ghost">Cancel</Button>
                </Link>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="mr-1.5 h-3.5 w-3.5" /> Save Changes</>
                  )}
                </Button>
              </div>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}