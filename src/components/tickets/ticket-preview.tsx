import { formatCalendarDate } from "./ticket-format";

interface TicketPreviewProps {
  serial: string;
  categoryName: string;
  event: {
    name: string;
    venue: string;
    address: string | null;
    eventDate: string;
    startTime: string;
    endTime: string;
    ticketFooterText: string | null;
  };
  /** Authenticated URL that renders the real QR as an image — the raw token
   * itself never reaches the browser (rule 6). */
  qrSrc?: string;
}

/**
 * Responsive visual preview of the 210 × 59 mm print artwork. The PDF remains
 * authoritative; this preview scales its aspect ratio to the available width.
 */
export function TicketPreview({ serial, categoryName, event, qrSrc }: TicketPreviewProps) {
  const place = event.address ? `${event.venue}, ${event.address}` : event.venue;

  return (
    <div className="inline-flex max-w-full flex-col gap-1.5">
      <div
        className="flex aspect-[397/112] w-full max-w-[397px] overflow-hidden rounded-md border border-border bg-white shadow-sm"
        aria-label={`Ticket preview for ${serial}`}
      >
        {/* Main section (~70%) */}
        <div className="flex w-[70%] min-w-0 flex-row gap-[1.5%] p-[2%]">
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <div className="rounded-sm bg-brand-700 px-[3%] py-[1%]">
                <p className="truncate text-[clamp(6px,2.2vw,9px)] font-bold text-white">
                  {event.name}
                </p>
              </div>
              <div className="mt-0.5 h-0.5 bg-gold-500" />
              <p className="mt-1 truncate text-[clamp(5px,1.8vw,7px)] text-ink">
                {formatCalendarDate(event.eventDate)} · {event.startTime}–
                {event.endTime}
              </p>
              <p className="truncate text-[clamp(5px,1.8vw,7px)] text-ink">{place}</p>
            </div>
            <div>
              <p className="truncate text-[clamp(6px,2vw,8px)] font-bold text-brand-700">
                {categoryName}
              </p>
              <p className="truncate font-mono text-[clamp(8px,3vw,12px)] font-bold tracking-wide text-ink">{serial}</p>
            </div>
            <p className="line-clamp-2 text-[clamp(4px,1.4vw,5px)] leading-tight text-muted-foreground">
              Duplicate serials are void. Only a server-confirmed scan admits
              entry.
              {event.ticketFooterText ? ` ${event.ticketFooterText}` : ""}
            </p>
          </div>
          <div className="flex w-[27%] shrink-0 flex-col items-center justify-center gap-[1%]">
            {qrSrc ? (
              // QR comes from an authenticated PNG endpoint; next/image
              // optimization would fetch it without the session cookie.
              <img // eslint-disable-line @next/next/no-img-element
                src={qrSrc}
                alt="QR code printed on this ticket"
                width={78}
                height={78}
                className="aspect-square w-full max-w-[78px] object-contain"
              />
            ) : (
              <div className="flex aspect-square w-full max-w-[78px] items-center justify-center rounded-sm border border-dashed border-muted-foreground text-center text-[clamp(5px,1.7vw,6px)] text-muted-foreground">
                QR printed
                <br />
                at production
              </div>
            )}
            <p className="text-[clamp(4px,1.4vw,5px)] text-muted-foreground">Scan at the gate</p>
          </div>
        </div>

        {/* Detached stub (~30%) */}
        <div className="flex w-[30%] min-w-0 shrink-0 flex-col justify-between border-l border-dashed border-muted-foreground bg-brand-50 p-[1.5%] text-center">
          <div>
            <div className="rounded-sm bg-brand-700 py-[1%]">
              <p className="text-[clamp(6px,1.8vw,8px)] font-bold tracking-widest text-white">
                KSP
              </p>
            </div>
            <p className="text-[clamp(4px,1.3vw,5px)] text-muted-foreground">ADMIT ONE</p>
          </div>
          <div>
            <p className="line-clamp-2 text-[clamp(5px,1.6vw,6px)] font-bold leading-tight text-brand-700">
              {categoryName}
            </p>
            <p className="truncate font-mono text-[clamp(6px,2.3vw,9px)] font-bold text-ink">{serial}</p>
          </div>
          <div>
            <p className="text-[clamp(4px,1.3vw,5px)] text-muted-foreground">KEEP THIS STUB</p>
            <p className="truncate text-[clamp(5px,1.6vw,6px)] text-ink">
              {formatCalendarDate(event.eventDate)}
            </p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Preview scales to this screen; the PDF is the print master. Print one
        sample at 100% scale before the production run.
      </p>
    </div>
  );
}
