"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

const STATUS: Record<string, string> = {
  DRAFT:     "border-muted/40 text-muted-foreground",
  PUBLISHED: "border-primary/40 text-primary",
  ARCHIVED:  "border-muted/40 text-muted-foreground",
};

export default function DocumentsPage() {
  const [items, setItems] = useState<Document[]>([]);
  const [category, setCategory] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("category", category);
    const r = await fetch(`/api/documents?${params}`);
    const j = await r.json();
    if (j.ok) setItems(j.data.documents ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [category]);

  const categories = Array.from(new Set(items.map((d) => d.category)));

  return (
    <div className="container mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
          <FileText className="h-7 w-7 text-primary" /> Documents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Policies, procedures, MoCs, JSAs, and certifications.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">المستندات والوثائق</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={category === "ALL" ? "default" : "outline"} size="sm" onClick={() => setCategory("ALL")}>ALL</Button>
        {categories.map((c) => (
          <Button key={c} variant={category === c ? "default" : "outline"} size="sm" onClick={() => setCategory(c)}>{c}</Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="glass"><CardContent className="py-12 text-center text-sm text-muted-foreground">No documents.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((d) => (
            <Card key={d.id} className="glass">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold truncate">{d.title}</span>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS[d.status])}>{d.status}</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">{d.category}</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">v{d.version}</Badge>
                    </div>
                    {d.requiresAcknowledgment && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-risk-medium">
                        <CheckCheck className="h-3 w-3" />
                        Requires acknowledgment · {d._count.acknowledgments} acks
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {d.site ? `📍 ${d.site.code}` : "🌐 Global"} · by {d.uploadedBy.name}
                      </span>
                      {d.fileUrl && (
                        <a href={d.fileUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
