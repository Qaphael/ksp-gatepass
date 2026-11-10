"use client";

import Image from "next/image";
import type { TicketTemplateConfig } from "@/lib/validation/ticket-templates";

interface TemplateTicketPreviewProps {
  name: string;
  version: number;
  artworkUrl: string;
  config: TicketTemplateConfig;
  serial: string;
  qrSrc: string;
  values: {
    category: string;
    price: string;
    eventName: string;
    eventDate: string;
    eventTime: string;
    venue: string;
    footerText: string;
    organiserContact: string;
    authNotice: string;
  };
}

const PT_TO_TICKET_WIDTH_CQW = 100 / (210 * 72 / 25.4);

function trimPosition(xMm: number, yMm: number, widthMm: number, heightMm: number, bleedMm: number) {
  return {
    left: `${(bleedMm + xMm) / (widthMm + bleedMm * 2) * 100}%`,
    top: `${(bleedMm + yMm) / (heightMm + bleedMm * 2) * 100}%`,
    width: `${widthMm / (widthMm + bleedMm * 2) * 100}%`,
    height: `${heightMm / (heightMm + bleedMm * 2) * 100}%`,
  };
}

export function TemplateTicketPreview({ name, version, artworkUrl, config, serial, qrSrc, values }: TemplateTicketPreviewProps) {
  const outerWidth = config.trim.widthMm + config.bleedMm * 2;
  const outerHeight = config.trim.heightMm + config.bleedMm * 2;
  const trim = trimPosition(0, 0, config.trim.widthMm, config.trim.heightMm, config.bleedMm);
  const textFields = (zone: TicketTemplateConfig["bottomStrip"], zoneName: "bottomStrip" | "stub") =>
    zone.fields.filter((field) => field.enabled).map((field, index) => {
      const value = field.key === "serial" ? serial : values[field.key];
      if (!value) return null;
      const rotation = zoneName === "stub" ? config.stub.rotation : 0;
      return <span key={`${zoneName}-${field.key}-${index}`} className="absolute overflow-hidden whitespace-nowrap" style={{
        left: `${(zone.xMm + field.xMm) / config.trim.widthMm * 100}%`,
        top: `${(zone.yMm + field.yMm) / config.trim.heightMm * 100}%`,
        width: `${field.maxWidthMm / config.trim.widthMm * 100}%`,
        fontFamily: field.font === "mono" ? "monospace" : "inherit",
        fontSize: `clamp(4px, ${field.sizePt * PT_TO_TICKET_WIDTH_CQW}cqw, 18px)`,
        fontWeight: field.weight === "bold" ? 700 : 400,
        color: field.color,
        textAlign: field.align,
        textTransform: field.uppercase ? "uppercase" : undefined,
        letterSpacing: `${field.letterSpacingPt * PT_TO_TICKET_WIDTH_CQW}cqw`,
        lineHeight: 1,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "top left",
      }}>{value}</span>;
    });

  return <div className="min-w-0 space-y-2">
    <div className="overflow-hidden rounded-md border bg-muted p-2">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden bg-white shadow-sm" style={{ containerType: "inline-size", aspectRatio: `${outerWidth}/${outerHeight}` }} aria-label={`Template ticket preview for ${serial}`}>
        <Image src={artworkUrl} alt={`${name} ticket artwork`} fill unoptimized sizes="(max-width: 768px) 100vw, 900px" className="object-fill" />
        <div className="absolute overflow-hidden" style={trim}>
          <div className="absolute" style={{ left: `${config.qr.xMm / 210 * 100}%`, top: `${config.qr.yMm / 59 * 100}%`, width: `${config.qr.sizeMm / 210 * 100}%`, aspectRatio: "1" }}>
            {config.qr.panel.enabled ? <div className="absolute rounded-sm" style={{
              inset: `${config.qr.panel.paddingMm / config.qr.sizeMm * -100}%`,
              borderRadius: `${config.qr.panel.radiusMm / outerWidth * 100}cqw`,
              backgroundColor: config.qr.panel.color,
            }} /> : null}
            <img // eslint-disable-line @next/next/no-img-element -- Authenticated QR endpoint must load with the staff session cookie.
              src={qrSrc} alt={`QR code for ${serial}`} className="relative size-full object-contain"
            />
          </div>
          {textFields(config.bottomStrip, "bottomStrip")}
          {textFields(config.stub, "stub")}
        </div>
      </div>
    </div>
    <p className="text-sm font-medium">{name} · v{version} · {serial}</p>
    <p className="text-xs text-muted-foreground">Artwork and configured fields from the active template. Use the PDF for the final print layout.</p>
  </div>;
}
