"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Camera, Car, Check, Cog, Droplets, Flame, HelpCircle, Loader2, LocateFixed, ShieldAlert, UserRoundX, WifiOff, Wind, X,
  type LucideIcon,
} from "lucide-react";
import { useFormat, useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { tryOrQueue } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TONE_DOT, toneFor } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const TYPES: { id: string; icon: LucideIcon }[] = [
  { id: "FIRE", icon: Flame },
  { id: "GAS_LEAK", icon: Wind },
  { id: "SPILL", icon: Droplets },
  { id: "INJURY", icon: UserRoundX },
  { id: "EQUIPMENT", icon: Cog },
  { id: "VEHICLE", icon: Car },
  { id: "NEAR_MISS", icon: AlertTriangle },
  { id: "SECURITY", icon: ShieldAlert },
  { id: "OTHER", icon: HelpCircle },
];

interface Site { id: string; code: string; name: string; nameAr?: string | null }
type Geo = { lat: number; lng: number; accuracy: number };
type Result = { kind: "sent"; number: string; urgent: boolean } | { kind: "queued" };

const MAX_PHOTOS = 3;
const URGENT_TYPES = new Set(["FIRE", "GAS_LEAK", "INJURY"]);

/** Shrink a phone photo to ≤1600px JPEG (~200–400 KB) before upload. */
async function compressPhoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

export default function ReportPage() {
  const { t, isAr } = useI18n();
  const f = useFormat();

  const [type, setType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [place, setPlace] = useState("");
  const [description, setDescription] = useState("");
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "denied" | "failed">("idle");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Partial<Record<"type" | "severity" | "description" | "form", MessageKey>>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/sites", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.ok && setSites(j.data?.sites ?? j.data ?? []))
      .catch(() => {});
  }, []);

  function locate() {
    if (!("geolocation" in navigator)) return setGeoState("failed");
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setGeoState("idle");
      },
      (e) => setGeoState(e.code === e.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function addPhotos(files: FileList | null) {
    setPhotoError(false);
    for (const file of Array.from(files ?? []).slice(0, MAX_PHOTOS - photos.length)) {
      try {
        const url = await compressPhoto(file);
        setPhotos((p) => (p.length < MAX_PHOTOS ? [...p, url] : p));
      } catch {
        setPhotoError(true);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    const next: typeof errors = {};
    if (!type) next.type = "mobile.report.errors.type";
    if (!severity) next.severity = "mobile.report.errors.severity";
    if (description.trim().length < 3) next.description = "mobile.report.errors.description";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSending(true);
    const res = await tryOrQueue("/api/incidents", "POST", {
      clientId: crypto.randomUUID(),
      type,
      severity,
      description: description.trim(),
      location: place.trim() || undefined,
      siteId: siteId || undefined,
      lat: geo?.lat,
      lng: geo?.lng,
      occurredAt: new Date().toISOString(),
      photos: photos.length ? photos : undefined,
    });
    setSending(false);

    if (!res.online) return setResult({ kind: "queued" });
    const body = res.result as { ok?: boolean; data?: { incidentNumber: string }; error?: { code?: string } } | undefined;
    if (body?.ok && body.data)
      return setResult({ kind: "sent", number: body.data.incidentNumber, urgent: severity === "HIGH" || severity === "CRITICAL" || URGENT_TYPES.has(type!) });
    const code = body?.error?.code;
    setErrors({
      form:
        code === "SITE_FORBIDDEN" ? "mobile.report.errors.site"
        : code === "NO_SITE" ? "mobile.report.errors.noSite"
        : code === "UNAUTHORIZED" ? "mobile.report.errors.session"
        : code === "VALIDATION" ? "mobile.report.errors.invalid"
        : "mobile.report.errors.failed",
    });
  }

  function reset() {
    setType(null);
    setSeverity(null);
    setPlace("");
    setDescription("");
    setGeo(null);
    setPhotos([]);
    setErrors({});
    setResult(null);
  }

  if (result) {
    const sent = result.kind === "sent";
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center animate-fade-in">
        <div className={cn("flex h-20 w-20 items-center justify-center rounded-full", sent ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
          {sent ? <Check className="h-10 w-10" strokeWidth={2.5} /> : <WifiOff className="h-10 w-10" />}
        </div>
        <h1 className="text-2xl font-semibold">{sent ? t("mobile.report.sent.title") : t("mobile.report.queued.title")}</h1>
        {sent && (
          <p className="text-muted-foreground">
            {t("mobile.report.sent.reference")}: <bdi className="font-mono font-medium text-foreground" dir="ltr">{result.number}</bdi>
          </p>
        )}
        <p className="max-w-xs text-muted-foreground">{sent ? t("mobile.report.sent.body") : t("mobile.report.queued.body")}</p>
        {sent && result.urgent && <p className="max-w-xs font-medium text-success">{t("mobile.report.alertSent")}</p>}
        <div className="mt-4 grid w-full max-w-xs gap-3">
          <Button size="lg" className="h-14 text-base" onClick={reset}>{t("mobile.report.another")}</Button>
          <Button size="lg" variant="outline" className="h-14 text-base" asChild>
            <Link href="/m">{t("mobile.report.home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold">{t("mobile.report.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("mobile.report.description")}</p>
      </div>

      {/* 1. What happened */}
      <fieldset>
        <Legend label={t("mobile.report.typeLabel")} error={errors.type && t(errors.type)} />
        <div className="grid grid-cols-3 gap-2.5">
          {TYPES.map(({ id, icon: Icon }) => {
            const on = type === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => { setType(id); setErrors((e) => ({ ...e, type: undefined })); }}
                className={cn(
                  "flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border-2 px-1 text-sm font-medium transition-colors active:scale-[0.97]",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card",
                )}
              >
                <Icon className="h-7 w-7" strokeWidth={1.75} />
                <span className="leading-tight">{t(`mobile.report.types.${id}` as MessageKey)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 2. How serious — no default */}
      <fieldset>
        <Legend label={t("mobile.report.severityLabel")} error={errors.severity && t(errors.severity)} />
        <div className="grid gap-2">
          {SEVERITIES.map((s) => {
            const on = severity === s;
            const tone = toneFor(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => { setSeverity(s); setErrors((e) => ({ ...e, severity: undefined })); }}
                className={cn(
                  "flex min-h-[60px] items-center gap-3 rounded-2xl border-2 px-4 text-start transition-colors",
                  on ? "border-primary bg-primary/10" : "border-border bg-card",
                )}
              >
                <span className={cn("h-3 w-3 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{f.enum("severity", s)}</span>
                  <span className="block text-sm text-muted-foreground">{t(`mobile.report.severityHint.${s}` as MessageKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {(severity === "CRITICAL" || type === "FIRE" || type === "GAS_LEAK") && (
          <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t("mobile.report.criticalNote")}
          </p>
        )}
      </fieldset>

      {/* 3. Where */}
      <fieldset className="space-y-3">
        <Legend label={t("mobile.report.whereLabel")} hint={t("mobile.report.optional")} />
        {sites.length > 0 && (
          <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-14 text-base" aria-label={t("mobile.report.site")}>
            <option value="">{t("mobile.report.siteAuto")}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{isAr ? s.nameAr || s.name : s.name}</option>
            ))}
          </NativeSelect>
        )}
        <Button type="button" variant="outline" size="lg" className="h-14 w-full text-base" onClick={locate} disabled={geoState === "locating"}>
          {geoState === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          {geoState === "locating" ? t("mobile.report.locating") : t("mobile.report.useLocation")}
        </Button>
        {geo && <p className="text-sm text-success">{t("mobile.report.locationAdded", { m: geo.accuracy })}</p>}
        {geoState === "denied" && <p className="text-sm text-muted-foreground">{t("mobile.report.locationDenied")}</p>}
        {geoState === "failed" && <p className="text-sm text-muted-foreground">{t("mobile.report.locationUnavailable")}</p>}
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder={t("mobile.report.locationPlaceholder")}
          aria-label={t("mobile.report.locationField")}
          className="h-14 w-full rounded-xl border border-input bg-card px-4 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </fieldset>

      {/* 4. What did you see */}
      <fieldset>
        <Legend label={t("mobile.report.descriptionLabel")} error={errors.description && t(errors.description)} />
        <Textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, description: undefined })); }}
          placeholder={t("mobile.report.descriptionPlaceholder")}
          rows={4}
          className="rounded-xl text-base"
        />
      </fieldset>

      {/* 5. Photos */}
      <fieldset>
        <Legend label={t("mobile.report.photosLabel")} hint={t("mobile.report.photosHint")} />
        <div className="grid grid-cols-3 gap-2.5">
          {photos.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-2xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                aria-label={t("mobile.report.removePhoto")}
                className="absolute end-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-card"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed bg-card px-2 text-center text-sm text-muted-foreground active:scale-[0.97]"
            >
              <Camera className="h-7 w-7" strokeWidth={1.75} />
              <span className="leading-tight">{t("mobile.report.takePhoto")}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
        {photoError && <p className="mt-2 text-sm text-danger">{t("mobile.report.photoFailed")}</p>}
      </fieldset>

      {errors.form && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">{t(errors.form)}</p>}

      <Button size="lg" className="h-16 w-full rounded-2xl text-lg" onClick={submit} disabled={sending}>
        {sending ? <><Loader2 className="animate-spin" /> {t("mobile.report.sending")}</> : t("mobile.report.submit")}
      </Button>
    </div>
  );
}

function Legend({ label, hint, error }: { label: string; hint?: string; error?: string | false }) {
  return (
    <legend className="mb-3 flex w-full items-baseline justify-between gap-2">
      <span className="text-lg font-semibold">{label}</span>
      {error ? <span className="text-sm font-medium text-danger">{error}</span> : hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </legend>
  );
}
