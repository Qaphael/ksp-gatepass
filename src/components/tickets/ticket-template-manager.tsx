"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FileImage, FileText, Loader2, Minus, Plus, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { QR_MODULE_COUNT, QR_MIN_MODULE_SIZE_MM, QR_MIN_PRINTED_SIZE_MM, TEMPLATE_A4_SCALE, placeholderTicketTemplateConfig, type TicketTemplateConfig } from "@/lib/validation/ticket-templates";

type Template = { id: string; seriesId: string; eventId: string; name: string; version: number; artworkUrl: string; assetWidthPx: number; assetHeightPx: number; config: unknown; status: "DRAFT" | "ACTIVE" | "RETIRED"; zonesArePlaceholder: boolean; confirmedAt: string | null; calibrationPrintedAt: string | null; createdAt: string };
const keys = ["serial", "category", "price", "eventName", "eventDate", "eventTime", "venue", "footerText", "organiserContact", "authNotice"] as const;
const labels: Record<string, string> = { serial: "Serial", category: "Category", price: "Price", eventName: "Event name", eventDate: "Event date", eventTime: "Event time", venue: "Venue", footerText: "Footer", organiserContact: "Organiser contact", authNotice: "Authenticity notice" };
function initialConfig(value?: unknown): TicketTemplateConfig { try { return value as TicketTemplateConfig ?? placeholderTicketTemplateConfig(); } catch { return placeholderTicketTemplateConfig(); } }
function uid() { return crypto.randomUUID(); }

export function TicketTemplateManager({ eventId, initialTemplates }: { eventId: string; initialTemplates: Template[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const [name, setName] = useState(initialTemplates[0]?.name ?? "");
  const [config, setConfig] = useState<TicketTemplateConfig>(initialConfig(initialTemplates[0]?.config));
  const [file, setFile] = useState<File | null>(null);
  const [importText, setImportText] = useState("");
  const [printBatchId, setPrintBatchId] = useState("");
  const [calibrationPrintId, setCalibrationPrintId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activationOpen, setActivationOpen] = useState(false);
  const activeConfig = useMemo(() => config, [config]);
  const printedQr = activeConfig.qr.sizeMm * TEMPLATE_A4_SCALE;
  const moduleSize = printedQr / (QR_MODULE_COUNT + 8);
  const qrReady = printedQr >= QR_MIN_PRINTED_SIZE_MM && moduleSize >= QR_MIN_MODULE_SIZE_MM;
  const hasUnsavedChanges = Boolean(selected && JSON.stringify(config) !== JSON.stringify(selected.config));
  const allMeasured = Boolean(selected && !selected.zonesArePlaceholder && !hasUnsavedChanges && JSON.stringify(config) !== JSON.stringify(placeholderTicketTemplateConfig()));

  function selectTemplate(template: Template) {
    setSelectedId(template.id); setName(template.name); setConfig(initialConfig(template.config)); setError(""); setNotice("");
  }
  function updateConfig(mutator: (current: TicketTemplateConfig) => TicketTemplateConfig) { setConfig((current) => mutator(current)); }
  function updateField(zone: "bottomStrip" | "stub", key: typeof keys[number], fieldKey: "enabled" | "xMm" | "yMm" | "maxWidthMm" | "sizePt" | "color" | "weight" | "align", value: string | boolean | number) {
    updateConfig((current) => {
      const fields = current[zone].fields.slice();
      const index = fields.findIndex((field) => field.key === key);
      if (index < 0) fields.push({ key, xMm: 1, yMm: Math.max(1, fields.length * 2.5), maxWidthMm: Math.max(1, current[zone].widthMm - 2), font: key === "serial" ? "mono" : "primary", sizePt: 8, weight: "regular", color: "#14201B", align: "left", uppercase: key === "serial", letterSpacingPt: 0, enabled: false });
      const fieldIndex = index < 0 ? fields.length - 1 : index;
      fields[fieldIndex] = { ...fields[fieldIndex], [fieldKey]: typeof value === "string" && ["xMm", "yMm", "maxWidthMm", "sizePt"].includes(fieldKey) ? Number(value) : value } as typeof fields[number];
      return { ...current, [zone]: { ...current[zone], fields } };
    });
  }

  async function submitArtwork() {
    if (!file || !name.trim()) { setError("Enter a template name and choose a PNG or JPEG artwork file."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("name", name.trim()); form.set("config", JSON.stringify(config)); form.set("file", file);
      const response = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/ticket-templates`, { method: "POST", headers: { "Idempotency-Key": uid() }, body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Upload failed. Please try again.");
      const template = body.template as Template; setTemplates((items) => [template, ...items]); selectTemplate(template); setNotice("Artwork uploaded. Zone values are still placeholders until you enter measurements from the design file."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed. Check the connection and try again."); }
    finally { setBusy(false); }
  }
  async function saveConfig() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    const result = await apiFetch<{ template: Template }>(`/api/v1/ticket-templates/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Idempotency-Key": uid() }, body: JSON.stringify({ name: name.trim() || selected.name, config }) });
    if (!result.ok) { setError(result.error.message); setBusy(false); return; }
    setTemplates((items) => [result.data.template, ...items]); selectTemplate(result.data.template); setNotice("Saved as a new template version. Earlier versions remain available for reprints."); router.refresh(); setBusy(false);
  }
  async function activate() {
    if (!selected) return;
    setBusy(true); setError("");
    const result = await apiFetch<{ template: Template }>(`/api/v1/ticket-templates/${encodeURIComponent(selected.id)}/activate`, { method: "POST", headers: { "Idempotency-Key": uid() }, body: JSON.stringify({ ownerConfirmed: true, production: true }) });
    if (!result.ok) { setError(result.error.message); setBusy(false); setActivationOpen(false); return; }
    setTemplates((items) => items.map((item) => item.seriesId === result.data.template.seriesId ? { ...item, status: item.id === result.data.template.id ? "ACTIVE" : "RETIRED" } : item)); setActivationOpen(false); setNotice("Template activated by the server."); router.refresh(); setBusy(false);
  }
  function importMeasurements() {
    setError("");
    try { const parsed = JSON.parse(importText) as TicketTemplateConfig; if (parsed.schemaVersion !== 1 || !parsed.qr || !parsed.bottomStrip || !parsed.stub || parsed.trim?.widthMm !== 210 || parsed.trim?.heightMm !== 59) throw new Error("JSON must contain the version 1 template measurements for a 210 × 59 mm ticket."); setConfig(parsed); setNotice("Measurement values loaded into the editor. Save to create a version."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read measurement JSON."); }
  }
  async function openPdf(path: string) {
    setBusy(true); setError("");
    try { const response = await fetch(path); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message ?? "PDF could not be generated."); } if (path.endsWith("/calibration.pdf")) setCalibrationPrintId(response.headers.get("X-Print-Batch-Id") ?? ""); const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank", "noopener,noreferrer"); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "PDF could not be generated."); }
    finally { setBusy(false); }
  }
  async function confirmCalibrationPrinted() {
    if (!selected || !calibrationPrintId) return;
    setBusy(true); setError("");
    const result = await apiFetch<{ template: Template }>(`/api/v1/ticket-templates/${encodeURIComponent(selected.id)}/calibration`, { method: "POST", headers: { "Idempotency-Key": uid() }, body: JSON.stringify({ printBatchId: calibrationPrintId, confirmedPrinted: true }) });
    if (!result.ok) setError(result.error.message);
    else { setTemplates((items) => items.map((item) => item.id === result.data.template.id ? result.data.template : item)); setCalibrationPrintId(""); setNotice("Paper calibration print recorded."); router.refresh(); }
    setBusy(false);
  }

  return <div className="grid gap-5 lg:grid-cols-[minmax(15rem,0.75fr)_minmax(0,2fr)]">
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Versions</h2><Button type="button" size="sm" variant="outline" onClick={() => { setSelectedId(""); setName(""); setConfig(placeholderTicketTemplateConfig()); setFile(null); setError(""); }}><Plus /> New</Button></div>
      {templates.length ? templates.map((template) => <button key={template.id} type="button" onClick={() => selectTemplate(template)} className={`min-h-16 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${template.id === selectedId ? "border-primary bg-primary/5" : "bg-card"}`}><span className="flex items-center justify-between gap-2 font-medium"><span className="truncate">{template.name} · v{template.version}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{template.status}</span></span><span className="mt-1 block text-sm text-muted-foreground">{template.zonesArePlaceholder ? "Placeholder zones" : "Measured zones"} · {template.calibrationPrintedAt ? "Calibration recorded" : "No calibration print"}</span></button>) : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No ticket templates yet. Upload your ticket artwork to begin.</div>}
      <div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-medium">Measurement sheet</p><p className="mt-1 text-muted-foreground">Measure from the top-left trim edge. Artwork is 210 × 59 mm plus bleed. Placeholder values cannot be activated for production. The guide is in docs/TICKET-ZONES-MEASUREMENT.md.</p></div>
    </section>
    <section className="min-w-0 space-y-4">
      {!selected ? <div className="rounded-xl border bg-card p-4 sm:p-5"><h2 className="text-lg font-semibold">Upload ticket artwork</h2><p className="mt-1 text-sm text-muted-foreground">PNG or JPEG, RGB. Maximum 40 MB and 40 megapixels. Expected aspect ratio at 300 dpi: about 2551 × 768 px for 216 × 65 mm including 3 mm bleed.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="grid gap-1 text-sm font-medium">Template name<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Main event ticket" /></label><label className="grid gap-1 text-sm font-medium">Artwork file<input className="min-h-12 w-full rounded-lg border bg-background px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><Button type="button" disabled={busy} className="min-h-12 self-end" onClick={() => void submitArtwork()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload</Button></div><div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mr-2 inline size-4" />The upload starts with placeholder zones. Measure the real design before production activation.</div></div> : <>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.name} · version {selected.version}</h2><p className="text-sm text-muted-foreground">{selected.assetWidthPx} × {selected.assetHeightPx} px · {selected.zonesArePlaceholder ? "Placeholder measurements" : "Measured configuration"}</p></div><span className="rounded-full border px-3 py-1 text-sm">{selected.status}</span></div>
        <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">Live placement preview</h3><p className="mt-1 text-sm text-muted-foreground">True 210:59 trim proportions. Drag each box to move it, or drag an edge to resize; tap or drag enabled text to position it and use the controls below to fine-tune it. Printed size depends on selected sheet layout.</p><TemplatePreview template={selected} config={activeConfig} onConfig={updateConfig} onField={updateField} />
          <div className={`mt-3 rounded-lg p-3 text-sm ${qrReady ? "bg-brand-50 text-foreground" : "bg-amber-50 text-amber-950"}`}><strong>Default A4 at 94%:</strong> QR prints {printedQr.toFixed(1)} mm; module size about {moduleSize.toFixed(2)} mm. Minimums: {QR_MIN_PRINTED_SIZE_MM} mm QR and {QR_MIN_MODULE_SIZE_MM} mm modules. {qrReady ? "Meets size checks." : "Below minimum; production activation is blocked."}</div>
        </div>
        <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">Measured zones (mm from trim top-left)</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><NumberField label="QR left (x)" value={activeConfig.qr.xMm} onChange={(v) => updateConfig((c) => ({ ...c, qr: { ...c.qr, xMm: v === "" ? c.qr.xMm : v } }))} /><NumberField label="QR top (y)" value={activeConfig.qr.yMm} onChange={(v) => updateConfig((c) => ({ ...c, qr: { ...c.qr, yMm: v === "" ? c.qr.yMm : v } }))} /><NumberField label="QR size" value={activeConfig.qr.sizeMm} onChange={(v) => updateConfig((c) => ({ ...c, qr: { ...c.qr, sizeMm: v === "" ? c.qr.sizeMm : v } }))} /><NumberField label="Perforation x (blank if none)" value={activeConfig.perforationXMm ?? ""} onChange={(v) => updateConfig((c) => ({ ...c, perforationXMm: v === "" ? null : Number(v) }))} /><ZoneFields title="Bottom strip" zone="bottomStrip" config={activeConfig} onZone={(patch) => updateConfig((c) => ({ ...c, bottomStrip: { ...c.bottomStrip, ...patch } }))} onField={updateField} /><ZoneFields title="Stub" zone="stub" config={activeConfig} onZone={(patch) => updateConfig((c) => ({ ...c, stub: { ...c.stub, ...patch } }))} onField={updateField} /><label className="grid gap-1 text-sm font-medium">Stub text rotation<select className="h-12 rounded-lg border bg-background px-3 text-base" value={activeConfig.stub.rotation} onChange={(event) => updateConfig((c) => ({ ...c, stub: { ...c.stub, rotation: Number(event.target.value) as 0 | 90 | 270 } }))}><option value={0}>Horizontal</option><option value={90}>Rotate 90°</option><option value={270}>Rotate 270°</option></select></label><NumberField label="Bleed (mm)" value={activeConfig.bleedMm} onChange={(v) => updateConfig((c) => ({ ...c, bleedMm: v === "" ? c.bleedMm : v }))} /></div>
          <div className="mt-4 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void saveConfig()}><Save /> Save as new version</Button><Button type="button" variant="outline" disabled={busy || !qrReady || !allMeasured} onClick={() => setActivationOpen(true)}>Activate for production</Button></div>{hasUnsavedChanges ? <p className="mt-2 text-sm text-muted-foreground">Save these measurements as a version before activation.</p> : null}
        </div>
        <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">Import measurements</h3><p className="mt-1 text-sm text-muted-foreground">Paste the version 1 JSON from your measurement sheet. Invalid coordinates will be rejected when saved.</p><textarea className="mt-3 min-h-28 w-full rounded-lg border bg-background p-3 font-mono text-sm" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'{"schemaVersion":1,"trim":{"widthMm":210,"heightMm":59},…'} /><Button type="button" variant="outline" className="mt-2" onClick={importMeasurements}>Load measurement JSON</Button></div>
        <div className="rounded-xl border bg-card p-4"><h3 className="font-semibold">PDF outputs</h3><p className="mt-1 text-sm text-muted-foreground">Print and scan the calibration sheet on paper, then confirm below. For ticket outputs, enter a ticket batch ID. The batch uses its recorded template version for repeatable printing.</p><div className="mt-3 flex flex-wrap items-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void openPdf(`/api/v1/ticket-templates/${selected.id}/calibration.pdf`)}><FileText /> Calibration PDF</Button><label className="grid min-w-56 flex-1 gap-1 text-sm font-medium">Ticket batch ID<Input value={printBatchId} onChange={(event) => setPrintBatchId(event.target.value)} placeholder="Paste batch ID" /></label></div>{calibrationPrintId ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><span>After printing this sheet from paper, record the calibration.</span><Button type="button" size="sm" disabled={busy} onClick={() => void confirmCalibrationPrinted()}><Check /> I printed it on paper</Button></div> : null}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || !printBatchId.trim()} onClick={() => void openPdf(`/api/v1/ticket-batches/${encodeURIComponent(printBatchId.trim())}/print.pdf?mode=sample&outputKind=SHEET&ticketsPerPage=5&scale=0.94&cropMarks=false`)}><FileImage /> Preview sample (A)</Button><Button type="button" variant="outline" disabled={busy || !printBatchId.trim()} onClick={() => void openPdf(`/api/v1/ticket-batches/${encodeURIComponent(printBatchId.trim())}/print.pdf?outputKind=SHEET&ticketsPerPage=5&scale=0.94&cropMarks=false`)}>Layout A · A4 sheet</Button><Button type="button" variant="outline" disabled={busy || !printBatchId.trim()} onClick={() => void openPdf(`/api/v1/ticket-batches/${encodeURIComponent(printBatchId.trim())}/print.pdf?outputKind=SINGLE&ticketsPerPage=1&scale=1&cropMarks=true`)}>Layout B · Single ticket</Button><Button type="button" variant="outline" disabled={busy || !printBatchId.trim()} onClick={() => void openPdf(`/api/v1/ticket-batches/${encodeURIComponent(printBatchId.trim())}/print.pdf?outputKind=DATA_LAYER&ticketsPerPage=1&scale=1&cropMarks=false`)}>Layout C · Data layer</Button></div><p className="mt-3 text-sm text-muted-foreground">A: 5 per A4 at 94%. B: single ticket at 100% with bleed and crop marks. C: transparent data-only PDF for artwork merge. Perforation is performed by the print shop at the configured x position.</p></div>
      </>}
      {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-base text-destructive">{error}</p> : null}{notice ? <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-base">{notice}</p> : null}
    </section>
    <Dialog open={activationOpen} onOpenChange={setActivationOpen}><DialogContent><DialogHeader><DialogTitle>Activate template for production?</DialogTitle><DialogDescription>Confirm the measurements were taken from the real artwork. The server will reject placeholder zones and undersized QR codes. A calibration print should be printed and scanned on paper before production.</DialogDescription></DialogHeader><div className="rounded-lg bg-muted p-3 text-sm"><p>{allMeasured ? <><Check className="mr-1 inline size-4" />Measurements are marked as measured.</> : <><AlertTriangle className="mr-1 inline size-4" />This version still has placeholder measurements.</>}</p><p className="mt-1">Calibration print: {selected?.calibrationPrintedAt ? "recorded" : "not recorded yet"}</p><p className="mt-1">QR size check: {qrReady ? "passes" : "fails"}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setActivationOpen(false)}>Cancel</Button><Button type="button" disabled={busy || !allMeasured || !qrReady} onClick={() => void activate()}>{busy ? <Loader2 className="animate-spin" /> : null} Confirm activation</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number | string; onChange: (value: number | "") => void }) { return <label className="grid gap-1 text-sm font-medium">{label}<Input type="number" min="0" step="0.1" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></label>; }
function ZoneFields({ title, zone, config, onZone, onField }: { title: string; zone: "bottomStrip" | "stub"; config: TicketTemplateConfig; onZone: (patch: Partial<TicketTemplateConfig["bottomStrip"]>) => void; onField: (zone: "bottomStrip" | "stub", key: typeof keys[number], fieldKey: "enabled" | "xMm" | "yMm" | "maxWidthMm" | "sizePt" | "color" | "weight" | "align", value: string | boolean | number) => void }) {
  const box = config[zone];
  return <fieldset className="min-w-0 rounded-lg border p-3 sm:col-span-2"><legend className="px-1 font-medium">{title} box</legend><div className="grid gap-3 sm:grid-cols-4"><NumberField label="x" value={box.xMm} onChange={(v) => v !== "" && onZone({ xMm: v })} /><NumberField label="y" value={box.yMm} onChange={(v) => v !== "" && onZone({ yMm: v })} /><NumberField label="width" value={box.widthMm} onChange={(v) => v !== "" && onZone({ widthMm: v })} /><NumberField label="height" value={box.heightMm} onChange={(v) => v !== "" && onZone({ heightMm: v })} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{keys.map((key) => { const field = box.fields.find((item) => item.key === key); return <div key={key} className="rounded-lg bg-muted/40 p-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={field?.enabled ?? false} onChange={(e) => onField(zone, key, "enabled", e.target.checked)} />{labels[key]}</label>{field?.enabled ? <div className="grid grid-cols-2 gap-2"><NumberField label="x" value={field.xMm} onChange={(v) => v !== "" && onField(zone, key, "xMm", v)} /><NumberField label="y" value={field.yMm} onChange={(v) => v !== "" && onField(zone, key, "yMm", v)} /><NumberField label="Max width" value={field.maxWidthMm} onChange={(v) => v !== "" && onField(zone, key, "maxWidthMm", v)} /><NumberField label="Size (pt)" value={field.sizePt} onChange={(v) => v !== "" && onField(zone, key, "sizePt", v)} /><label className="grid gap-1 text-sm">Color<input type="color" className="h-12 w-full rounded border" value={field.color} onChange={(e) => onField(zone, key, "color", e.target.value)} /></label><label className="grid gap-1 text-sm">Weight<select className="h-12 rounded border bg-background px-2" value={field.weight} onChange={(e) => onField(zone, key, "weight", e.target.value)}><option value="regular">Regular</option><option value="bold">Bold</option></select></label><label className="grid gap-1 text-sm">Align<select className="h-12 rounded border bg-background px-2" value={field.align} onChange={(e) => onField(zone, key, "align", e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div> : null}</div>; })}</div></fieldset>;
}
function TemplatePreview({ template, config, onConfig, onField }: { template: Template; config: TicketTemplateConfig; onConfig: (mutator: (current: TicketTemplateConfig) => TicketTemplateConfig) => void; onField: (zone: "bottomStrip" | "stub", key: typeof keys[number], fieldKey: "enabled" | "xMm" | "yMm" | "maxWidthMm" | "sizePt" | "color" | "weight" | "align", value: string | boolean | number) => void }) {
  const trim = { left: 3 / 216 * 100, top: 3 / 65 * 100, width: 210 / 216 * 100, height: 59 / 65 * 100 };
  const pos = (x: number, y: number, w: number, h: number) => ({ left: `${trim.left + x / 210 * trim.width}%`, top: `${trim.top + y / 59 * trim.height}%`, width: `${w / 210 * trim.width}%`, height: `${h / 59 * trim.height}%` });
  const updateBox = (zone: "qr" | "bottomStrip" | "stub", patch: Record<string, number>) => onConfig((current) => ({ ...current, [zone]: { ...current[zone], ...patch } }));
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const fields = (["bottomStrip", "stub"] as const).flatMap((zone) => config[zone].fields.filter((field) => field.enabled).map((field) => ({ zone, field, id: `${zone}:${field.key}` })));
  const activeText = fields.find((item) => item.id === selectedText) ?? fields[0] ?? null;
  function adjust(field: typeof config.bottomStrip.fields[number], key: "xMm" | "yMm" | "sizePt" | "maxWidthMm", amount: number) {
    if (!activeText) return;
    const zone = config[activeText.zone];
    const limit = key === "sizePt" ? Math.min(72, (zone.heightMm - field.yMm) * 72 / 25.4) : zone.widthMm - field.xMm;
    const fieldValue = key === "xMm" || key === "yMm" ? Math.max(0, Math.min(key === "xMm" ? zone.widthMm - field.maxWidthMm : zone.heightMm - (field.sizePt * 25.4 / 72), field[key] + amount)) : Math.max(key === "sizePt" ? 3 : 1, Math.min(limit, field[key] + amount));
    onField(activeText.zone, field.key, key, Math.round(fieldValue * 10) / 10);
  }
  const renderFields = (zone: "bottomStrip" | "stub") => config[zone].fields.filter((field) => field.enabled).map((field) => {
    const id = `${zone}:${field.key}`; const selected = activeText?.id === id; const box = config[zone];
    return <TextOverlay key={field.key} id={id} label={labels[field.key]} zoneWidth={box.widthMm} zoneHeight={box.heightMm} field={field} selected={selected} onSelect={() => setSelectedText(id)} onChange={(key, value) => onField(zone, field.key, key, value)}>{sampleText(field.key)}</TextOverlay>;
  });
  return <div className="mt-3 overflow-hidden rounded-lg border bg-muted p-2"><div data-preview className="relative mx-auto aspect-[216/65] w-full max-w-4xl overflow-hidden bg-white shadow-sm"><Image src={template.artworkUrl} alt="Ticket artwork preview" fill unoptimized sizes="(max-width: 768px) 100vw, 900px" className="object-fill" /><div className="absolute border-2 border-dashed border-red-600" style={{ left: `${trim.left}%`, top: `${trim.top}%`, width: `${trim.width}%`, height: `${trim.height}%` }} /><InteractiveBox label="QR" color="sky" box={{ x: config.qr.xMm, y: config.qr.yMm, width: config.qr.sizeMm, height: config.qr.sizeMm }} style={pos(config.qr.xMm, config.qr.yMm, config.qr.sizeMm, config.qr.sizeMm)} onChange={(v) => { const size = Math.min(v.width, v.height); updateBox("qr", { xMm: v.x, yMm: v.y, sizeMm: size }); }}><span className="flex size-full items-center justify-center text-[clamp(7px,1.3vw,14px)] font-bold text-sky-950">QR</span></InteractiveBox><InteractiveBox label="Bottom strip" color="amber" box={{ x: config.bottomStrip.xMm, y: config.bottomStrip.yMm, width: config.bottomStrip.widthMm, height: config.bottomStrip.heightMm }} style={pos(config.bottomStrip.xMm, config.bottomStrip.yMm, config.bottomStrip.widthMm, config.bottomStrip.heightMm)} onChange={(v) => updateBox("bottomStrip", { xMm: v.x, yMm: v.y, widthMm: v.width, heightMm: v.height })}><span className="absolute left-1 top-0 text-[clamp(5px,0.8vw,9px)] font-bold text-amber-950">BOTTOM STRIP</span>{renderFields("bottomStrip")}</InteractiveBox><InteractiveBox label="Stub" color="violet" box={{ x: config.stub.xMm, y: config.stub.yMm, width: config.stub.widthMm, height: config.stub.heightMm }} style={pos(config.stub.xMm, config.stub.yMm, config.stub.widthMm, config.stub.heightMm)} onChange={(v) => updateBox("stub", { xMm: v.x, yMm: v.y, widthMm: v.width, heightMm: v.height })}><span className="absolute inset-0 flex items-center justify-center text-[clamp(5px,0.8vw,9px)] font-bold text-violet-950/70" style={{ writingMode: config.stub.rotation ? "vertical-rl" : "horizontal-tb" }}>STUB</span>{renderFields("stub")}</InteractiveBox>{config.perforationXMm !== null ? <div className="absolute border-l-2 border-dashed border-red-700" style={{ left: `${trim.left + config.perforationXMm / 210 * trim.width}%`, top: `${trim.top}%`, height: `${trim.height}%` }} /> : null}<span className="absolute bottom-0 left-1 text-[clamp(5px,0.8vw,9px)] text-red-700">TRIM</span></div>
    {fields.length ? <div className="mt-3 rounded-lg border bg-background p-3"><p className="text-sm font-semibold">Adjust enabled text</p><p className="mt-1 text-xs text-muted-foreground">Tap a label in the preview or choose it here, then drag it or use the large controls.</p><div className="mt-2 flex flex-wrap gap-2">{fields.map(({ id, zone, field }) => <Button key={id} type="button" size="sm" variant={activeText?.id === id ? "default" : "outline"} className="min-h-11" onClick={() => setSelectedText(id)}>{labels[field.key]} · {zone === "bottomStrip" ? "Strip" : "Stub"}</Button>)}</div>{activeText && <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-muted/40 p-3"><p className="mb-2 text-sm font-medium">Position · 0.5 mm</p><div className="grid grid-cols-3 gap-2"><span /><Button type="button" variant="outline" size="icon" className="size-11" aria-label="Move text up 0.5 millimetres" onClick={() => adjust(activeText.field, "yMm", -0.5)}><ArrowUp /></Button><span /><Button type="button" variant="outline" size="icon" className="size-11" aria-label="Move text left 0.5 millimetres" onClick={() => adjust(activeText.field, "xMm", -0.5)}><ArrowLeft /></Button><span className="flex items-center justify-center text-xs text-muted-foreground">{activeText.field.xMm.toFixed(1)}, {activeText.field.yMm.toFixed(1)}</span><Button type="button" variant="outline" size="icon" className="size-11" aria-label="Move text right 0.5 millimetres" onClick={() => adjust(activeText.field, "xMm", 0.5)}><ArrowRight /></Button><span /><Button type="button" variant="outline" size="icon" className="size-11" aria-label="Move text down 0.5 millimetres" onClick={() => adjust(activeText.field, "yMm", 0.5)}><ArrowDown /></Button><span /></div></div><div className="grid gap-3"><div className="rounded-lg bg-muted/40 p-3"><p className="mb-2 text-sm font-medium">Text size · {activeText.field.sizePt} pt</p><div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11 flex-1" aria-label="Decrease text size by half a point" onClick={() => adjust(activeText.field, "sizePt", -0.5)}><Minus /> Smaller</Button><Button type="button" variant="outline" className="min-h-11 flex-1" aria-label="Increase text size by half a point" onClick={() => adjust(activeText.field, "sizePt", 0.5)}><Plus /> Larger</Button></div></div><div className="rounded-lg bg-muted/40 p-3"><p className="mb-2 text-sm font-medium">Text width · {activeText.field.maxWidthMm} mm</p><div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11 flex-1" aria-label="Decrease text width by one millimetre" onClick={() => adjust(activeText.field, "maxWidthMm", -1)}><Minus /> Narrower</Button><Button type="button" variant="outline" className="min-h-11 flex-1" aria-label="Increase text width by one millimetre" onClick={() => adjust(activeText.field, "maxWidthMm", 1)}><Plus /> Wider</Button></div></div></div></div>}</div> : <p className="mt-3 rounded-lg border bg-background p-3 text-sm text-muted-foreground">Enable a text field below to move and size it here.</p>}
    <p className="mt-2 text-xs text-muted-foreground">Drag a box to move it. Drag its right or bottom edge or corner to resize. Text can be selected and nudged in 0.5 mm steps.</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Artwork</span><span className="text-red-700">Trim</span><span className="text-sky-700">QR</span><span className="text-amber-700">Bottom strip</span><span className="text-violet-700">Stub</span></div></div>;
}

function sampleText(key: typeof keys[number]) {
  const samples: Record<typeof keys[number], string> = { serial: "KSP-00001", category: "VIP", price: "UGX 50,000", eventName: "KSP Live", eventDate: "10 Nov 2026", eventTime: "7:00 PM", venue: "KSP Hotel Gulu", footerText: "Thank you for joining us", organiserContact: "+256 700 000 000", authNotice: "Valid for one admission" };
  return samples[key];
}

function TextOverlay({ id, label, zoneWidth, zoneHeight, field, selected, onSelect, onChange, children }: { id: string; label: string; zoneWidth: number; zoneHeight: number; field: TicketTemplateConfig["bottomStrip"]["fields"][number]; selected: boolean; onSelect: () => void; onChange: (key: "xMm" | "yMm", value: number) => void; children: React.ReactNode }) {
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  function start(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation(); onSelect();
    drag.current = { x: field.xMm, y: field.yMm, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const rect = event.currentTarget.parentElement?.getBoundingClientRect(); if (!rect) return;
    const x = Math.max(0, Math.min(zoneWidth - field.maxWidthMm, drag.current.x + (event.clientX - drag.current.startX) * zoneWidth / rect.width));
    const y = Math.max(0, Math.min(zoneHeight - field.sizePt * 25.4 / 72, drag.current.y + (event.clientY - drag.current.startY) * zoneHeight / rect.height));
    onChange("xMm", Math.round(x * 10) / 10); onChange("yMm", Math.round(y * 10) / 10);
  }
  return <button type="button" aria-label={`Select and drag ${label} text`} data-text-overlay={id} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={onSelect} className={`absolute z-10 min-h-7 touch-none cursor-move truncate rounded-sm border-0 bg-transparent px-0.5 text-left ${selected ? "outline outline-2 outline-primary bg-background/70" : "hover:outline hover:outline-1 hover:outline-primary/70"}`} style={{ left: `${field.xMm / zoneWidth * 100}%`, top: `${field.yMm / zoneHeight * 100}%`, width: `${Math.min(field.maxWidthMm, zoneWidth - field.xMm) / zoneWidth * 100}%`, maxHeight: "100%", color: field.color, fontSize: `clamp(5px, ${field.sizePt / 72 * 100 / 59 * 100}cqh, 10px)`, fontWeight: field.weight === "bold" ? 700 : 400, fontFamily: field.font === "mono" ? "monospace" : "inherit", textAlign: field.align }}>{children}</button>;
}

type Box = { x: number; y: number; width: number; height: number };
function InteractiveBox({ label, color, box, style, onChange, children }: { label: string; color: "sky" | "amber" | "violet"; box: Box; style: React.CSSProperties; onChange: (box: Box) => void; children: React.ReactNode }) {
  const drag = useRef<{ startX: number; startY: number; box: Box; mode: string } | null>(null);
  function begin(event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const mode = (event.target as HTMLElement).closest<HTMLElement>("[data-resize]")?.dataset.resize ?? "move";
    drag.current = { startX: event.clientX, startY: event.clientY, box, mode };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const rect = event.currentTarget.closest("[data-preview]")?.getBoundingClientRect();
    if (!rect) return;
    const dx = (event.clientX - drag.current.startX) * 216 / rect.width;
    const dy = (event.clientY - drag.current.startY) * 59 / rect.height;
    const start = drag.current.box; const next = { ...start };
    if (drag.current.mode === "move") { next.x = Math.max(0, Math.min(210 - start.width, start.x + dx)); next.y = Math.max(0, Math.min(59 - start.height, start.y + dy)); }
    else {
      if (drag.current.mode.includes("x")) next.width = Math.max(1, Math.min(210 - start.x, start.width + dx));
      if (drag.current.mode.includes("y")) next.height = Math.max(1, Math.min(59 - start.y, start.height + dy));
      if (label === "QR") { const size = Math.min(next.width, next.height, 210 - next.x, 59 - next.y); next.width = size; next.height = size; }
    }
    onChange(Object.fromEntries(Object.entries(next).map(([key, value]) => [key, Math.round(value * 10) / 10])) as Box);
  }
  const tone = color === "sky" ? "border-sky-600 bg-sky-400/15" : color === "amber" ? "border-amber-600 bg-amber-300/20" : "border-violet-600 bg-violet-300/20";
  const handle = "absolute z-10 block touch-none rounded-full border-2 border-current bg-white/90 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return <div role="group" aria-label={`${label} placement box`} onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} className={`absolute cursor-move border-2 ${tone} touch-none`} style={style}>{children}<button type="button" aria-label={`Resize ${label} width`} data-resize="x" onPointerDown={begin} className={`${handle} -right-3 top-1/2 size-6 -translate-y-1/2`} /><button type="button" aria-label={`Resize ${label} height`} data-resize="y" onPointerDown={begin} className={`${handle} -bottom-3 left-1/2 size-6 -translate-x-1/2`} /><button type="button" aria-label={`Resize ${label} width and height`} data-resize="xy" onPointerDown={begin} className={`${handle} -bottom-3 -right-3 size-7`} /></div>;
}
