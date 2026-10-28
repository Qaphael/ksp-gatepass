"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventBrandingAssetDto, EventBrandingKindValue } from "@/server/services/event-branding.service";

type Assets = { poster: EventBrandingAssetDto | null; logo: EventBrandingAssetDto | null };
type KindCardProps = { kind: EventBrandingKindValue; asset: EventBrandingAssetDto | null; altText: string; onAltText: (value: string) => void; onUpload: (file: File) => void; onRemove: () => void; busy: boolean; progress: number; error: string | null };

export function BrandingManager({ eventId, initialAssets }: { eventId: string; initialAssets: Assets }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [altTexts, setAltTexts] = useState({ poster: initialAssets.poster?.altText ?? "", logo: initialAssets.logo?.altText ?? "" });
  const [busyKind, setBusyKind] = useState<EventBrandingKindValue | null>(null);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<{ poster: string | null; logo: string | null }>({ poster: null, logo: null });
  const [removeKind, setRemoveKind] = useState<EventBrandingKindValue | null>(null);

  function upload(kind: EventBrandingKindValue, file: File) {
    const key = kind === "POSTER" ? "poster" : "logo";
    const altText = altTexts[key].trim();
    if (!altText) { setErrors((current) => ({ ...current, [key]: "Add alt text before uploading this image." })); return; }
    if (file.size > 5 * 1024 * 1024) { setErrors((current) => ({ ...current, [key]: "Image must be 5 MB or smaller." })); return; }
    setBusyKind(kind); setProgress(0); setErrors((current) => ({ ...current, [key]: null }));
    const body = new FormData();
    body.set("kind", kind); body.set("altText", altText); body.set("file", file);
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/v1/events/${encodeURIComponent(eventId)}/branding`);
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => { setErrors((current) => ({ ...current, [key]: "Upload failed. Check your connection and try again." })); setBusyKind(null); };
    request.onload = () => {
      let payload: { asset?: EventBrandingAssetDto; error?: { message?: string } } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* Surface a stable fallback below. */ }
      if (request.status < 200 || request.status >= 300 || !payload.asset) {
        setErrors((current) => ({ ...current, [key]: payload.error?.message ?? "The image could not be saved. Try again." }));
      } else {
        setAssets((current) => ({ ...current, [key]: payload.asset! }));
        setAltTexts((current) => ({ ...current, [key]: payload.asset!.altText }));
        setProgress(100);
        router.refresh();
      }
      setBusyKind(null);
    };
    request.send(body);
  }

  async function remove(kind: EventBrandingKindValue) {
    const key = kind === "POSTER" ? "poster" : "logo";
    setBusyKind(kind); setErrors((current) => ({ ...current, [key]: null }));
    try {
      const response = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/branding?kind=${kind}`, { method: "DELETE", headers: { accept: "application/json" } });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        setErrors((current) => ({ ...current, [key]: body?.error?.message ?? "The image could not be removed. Try again." }));
      } else {
        setAssets((current) => ({ ...current, [key]: null })); setAltTexts((current) => ({ ...current, [key]: "" })); setRemoveKind(null);
        router.refresh();
      }
    } catch {
      setErrors((current) => ({ ...current, [key]: "Could not reach the server. Check your connection and try again." }));
    } finally { setBusyKind(null); }
  }

  const activeAsset = removeKind === "POSTER" ? assets.poster : assets.logo;
  return <>
    <Card>
      <CardHeader><CardTitle>Event poster and logo</CardTitle><CardDescription>Images are public on their own URLs. JPEG, PNG and WebP only; maximum 5 MB. Uploading creates clean, resized WebP versions.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <BrandingKindCard kind="POSTER" asset={assets.poster} altText={altTexts.poster} onAltText={(value) => setAltTexts((current) => ({ ...current, poster: value }))} onUpload={(file) => upload("POSTER", file)} onRemove={() => setRemoveKind("POSTER")} busy={busyKind === "POSTER"} progress={busyKind === "POSTER" ? progress : 0} error={errors.poster} />
        <BrandingKindCard kind="LOGO" asset={assets.logo} altText={altTexts.logo} onAltText={(value) => setAltTexts((current) => ({ ...current, logo: value }))} onUpload={(file) => upload("LOGO", file)} onRemove={() => setRemoveKind("LOGO")} busy={busyKind === "LOGO"} progress={busyKind === "LOGO" ? progress : 0} error={errors.logo} />
      </CardContent>
    </Card>
    {removeKind && <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-3 sm:place-items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRemoveKind(null); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="remove-branding-title" className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-2xl sm:p-6">
        <h2 id="remove-branding-title" className="text-lg font-semibold">Remove {removeKind === "POSTER" ? "event poster" : "event logo"}?</h2>
        <p className="mt-2 text-base text-muted-foreground">This image will stop appearing on event pages and dashboards. The action will be recorded in the audit history.</p>
        {activeAsset && <p className="mt-3 break-words rounded-lg bg-muted p-3 text-sm">Alt text: {activeAsset.altText}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRemoveKind(null)} disabled={busyKind !== null}>Keep image</Button><Button type="button" variant="destructive" onClick={() => void remove(removeKind)} disabled={busyKind !== null}><Trash2 aria-hidden="true" />Remove image</Button></div>
      </section>
    </div>}
  </>;
}

function BrandingKindCard({ kind, asset, altText, onAltText, onUpload, onRemove, busy, progress, error }: KindCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const poster = kind === "POSTER";
  const title = poster ? "Event poster" : "Event logo";
  return <section className="min-w-0 rounded-xl border bg-card p-4" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) onUpload(file); }}>
    <div className="flex items-center gap-2"><ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" /><h3 className="text-base font-semibold">{title}{poster ? " (recommended)" : " (optional)"}</h3></div>
    <p className="mt-1 text-sm text-muted-foreground">Drop an image here on desktop, or choose a file from your phone.</p>
    <div className="mt-3 flex min-h-36 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40 p-2" style={asset ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}>
      {asset ? <Image src={asset.thumbnailUrl} alt={asset.altText} width={asset.width} height={asset.height} sizes="(max-width: 768px) 80vw, 400px" className="max-h-72 w-full object-contain" unoptimized loading="lazy" /> : <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImagePlus className="size-9" aria-hidden="true" /><span>No {poster ? "poster" : "logo"} uploaded</span></div>}
    </div>
    <label className="mt-3 grid gap-1.5 text-sm font-medium">Alt text <span className="font-normal text-muted-foreground">Required for this image</span>
      <input value={altText} onChange={(event) => onAltText(event.target.value)} maxLength={200} className="min-h-12 rounded-lg border border-input bg-background px-3 text-base" placeholder={poster ? "Guests at KSP Hotel Gulu" : "KSP Hotel Gulu logo"} disabled={busy} />
    </label>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} className="min-h-12 flex-1"><Upload aria-hidden="true" />{busy ? "Uploading…" : asset ? "Replace image" : "Choose image"}</Button>
      {asset && <Button type="button" variant="destructive" onClick={onRemove} disabled={busy} className="min-h-12"><Trash2 aria-hidden="true" />Remove</Button>}
    </div>
    {busy && <div className="mt-3" role="status" aria-live="polite"><div className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" />Uploading and preparing image</span><span className="tabular-nums">{progress}%</span></div><progress className="mt-2 h-2 w-full accent-brand-700" value={progress} max={100} aria-label={`${title} upload progress`} /></div>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger px-3 py-2 text-sm text-danger-foreground">{error}</p>}
    {asset && <a href={`${asset.displayUrl}&download=1`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Download {poster ? "poster" : "logo"}</a>}
  </section>;
}
