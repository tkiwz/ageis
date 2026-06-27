"use client";

import { useState } from "react";
import { Download, Loader2, UserSearch, ShieldAlert, CheckCircle2 } from "lucide-react";

interface Props {
  userId:          string;
  canExportOthers: boolean;
}

export function PrivacyActions({ userId, canExportOthers }: Props) {
  const [busy,        setBusy]        = useState(false);
  const [otherUserId, setOtherUserId] = useState("");
  const [success,     setSuccess]     = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  async function triggerDownload(targetId: string, filename: string) {
    setBusy(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await fetch(`/api/compliance/data-export?userId=${targetId}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Downloaded ${filename}`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">

      {/* Self export */}
      <div className="rounded-xl border border-border/40 bg-background/60 p-4 space-y-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Right of Access</div>
          <div className="text-xs text-muted-foreground">
            Download a complete JSON file of all personal data AEGIS holds about your account — incidents you filed, tasks, training records, audit trail entries, and AI decisions linked to you.
          </div>
        </div>
        <button
          onClick={() => triggerDownload(userId, `aegis-my-data-${userId}.json`)}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-4 py-2 text-sm hover:bg-muted/40 hover:border-primary/40 hover:text-primary disabled:opacity-50 transition-all">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download my data
        </button>
      </div>

      {/* Admin: export other user */}
      {canExportOthers && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-amber-400">Admin: Export Another User</div>
              <div className="text-xs text-muted-foreground">
                Every export is audit-logged with your identity, timestamp, and the target user ID. Only use for legitimate PDPL Art. 21 requests.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="User ID (cuid…)"
              value={otherUserId}
              onChange={(e) => setOtherUserId(e.target.value)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => triggerDownload(otherUserId.trim(), `aegis-user-data-${otherUserId.trim()}.json`)}
              disabled={busy || !otherUserId.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
              Export
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
