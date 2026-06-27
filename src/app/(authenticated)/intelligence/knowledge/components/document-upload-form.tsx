"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { playSound } from "@/lib/sound";

const ACCEPTED = ".txt,.md,.csv,.tsv,.log,.json,.html,.htm,.xml,.pdf";
const MAX_BYTES = 10 * 1024 * 1024;

export function DocumentUploadForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [contextType, setContextType] = useState("");
  const [contextId, setContextId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    warnings?: string[];
    truncated?: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setResult({ ok: false, message: `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` });
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (contextType) fd.append("contextType", contextType);
      if (contextId) fd.append("contextId", contextId);
      const r = await fetch("/api/knowledge/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.ok) {
        playSound(j.data.suggestionId ? "siren" : "success");
        setResult({
          ok: true,
          message: j.data.suggestionId
            ? "🚨 CRITICAL extracted — two-key confirmation pending."
            : "Document parsed and added to review queue.",
          warnings: j.data.extraction?.warnings,
          truncated: j.data.extraction?.truncated,
        });
        setFile(null);
        setContextType("");
        setContextId("");
        if (inputRef.current) inputRef.current.value = "";
        onSubmitted();
      } else {
        playSound("error");
        setResult({ ok: false, message: j.error?.message ?? "Upload failed" });
      }
    } catch (err) {
      playSound("error");
      setResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Upload className="h-4 w-4 text-primary" />
        <strong>Document upload</strong>
        <span className="text-muted-foreground text-xs">— PDF / TXT / CSV / HTML; AI extracts learnings</span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/40"
        }`}
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <div className="text-sm font-medium">
          {file ? file.name : "Click to choose or drag a file here"}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          PDF · TXT · MD · CSV · HTML · max 10 MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </div>

      {file && (
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <Button
            size="sm" variant="ghost"
            onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Context type (optional)</Label>
          <select
            value={contextType}
            onChange={(e) => setContextType(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="incident">Incident</option>
            <option value="permit">Permit</option>
            <option value="pipeline">Pipeline</option>
            <option value="site">Site</option>
            <option value="equipment">Equipment</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Context ID (optional)</Label>
          <Input
            placeholder="e.g. INC-2024-0042"
            value={contextId}
            onChange={(e) => setContextId(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <Button onClick={submit} disabled={busy || !file}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload & distill
      </Button>

      {result && (
        <div className={
          result.ok
            ? "rounded-md border border-risk-low/40 bg-risk-low/5 px-3 py-2 text-sm text-risk-low"
            : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        }>
          <div className="flex items-center gap-2">
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {result.message}
          </div>
          {result.warnings && result.warnings.length > 0 && (
            <ul className="mt-1.5 pl-5 list-disc text-xs opacity-80">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {result.truncated && (
            <div className="mt-1 text-xs opacity-80">⚠ File was truncated to first 5 MB for extraction.</div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
        💡 <strong>Tip:</strong> For best results, upload reports already written for humans (post-incident reports, lessons-learned docs, MoC documents). The AI extracts ONE concrete learning per document.
        <br /><br />
        📄 <strong>PDF note:</strong> Scanned PDFs (images) won&apos;t work. For full PDF support, install <code className="font-mono">pdf-parse</code> on the server.
      </div>
    </div>
  );
}
