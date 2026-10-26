"use client";

import { Camera } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Photos attached to a field report; click opens the full image. */
export function IncidentPhotos({ ids }: { ids: string[] }) {
  const t = useT();
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Camera className="h-4 w-4 text-muted-foreground" />
          {t("video.photos")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ids.map((id) => (
            <a key={id} href={`/api/incidents/photos/${id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/incidents/photos/${id}`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.02]" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
