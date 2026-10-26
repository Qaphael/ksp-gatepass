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
 * On-screen preview of the printed ticket (PRD 5.6): 210 × 59 mm artwork at
 * ~50% scale, main section + detachable stub with dashed perforation. The
 * printed PDF is the authoritative output; this is a visual check only.
 */
export function TicketPreview({ serial, categoryName, event, qrSrc }: TicketPreviewProps) {
  const place = event.address ? `${event.venue}, ${event.address}` : event.venue;

  return (
    <div className="inline-flex max-w-full flex-col gap-1.5">
      <div
        className="flex h-[112px] w-[397px] max-w-full overflow-hidden rounded-md border border-border bg-white shadow-sm"
        aria-label={`Ticket preview for ${serial}`}
      >
        {/* Main section (~70%) */}
        <div className="flex flex-[7] flex-row gap-2 p-2.5">
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <div className="rounded-sm bg-[#0B4D2C] px-2 py-1">
                <p className="truncate text-[10px] font-bold text-white">
                  {event.name}
                </p>
              </div>
              <div className="mt-0.5 h-0.5 bg-[#D4AF37]" />
              <p className="mt-1 text-[7px] text-[#1F2937]">
                {formatCalendarDate(event.eventDate)} · {event.startTime}–
                {event.endTime}
              </p>
              <p className="truncate text-[7px] text-[#1F2937]">{place}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-[#0B4D2C]">
                {categoryName}
              </p>
              <p className="text-[12px] font-bold text-[#1F2937]">{serial}</p>
            </div>
            <p className="text-[5px] text-[#6B7280]">
              Duplicate serials are void. Only a server-confirmed scan admits
              entry.
              {event.ticketFooterText ? ` ${event.ticketFooterText}` : ""}
            </p>
          </div>
          <div className="flex w-[86px] shrink-0 flex-col items-center justify-center gap-1">
            {qrSrc ? (
              // QR comes from an authenticated PNG endpoint; next/image
              // optimization would fetch it without the session cookie.
              <img // eslint-disable-line @next/next/no-img-element
                src={qrSrc}
                alt="QR code printed on this ticket"
                width={78}
                height={78}
                className="h-[78px] w-[78px]"
              />
            ) : (
              <div className="flex h-[78px] w-[78px] items-center justify-center rounded-sm border border-dashed border-[#6B7280] text-center text-[6px] text-[#6B7280]">
                QR printed
                <br />
                at production
              </div>
            )}
            <p className="text-[5px] text-[#6B7280]">Scan at the gate</p>
          </div>
        </div>

        {/* Detached stub (~30%) */}
        <div className="flex w-[116px] shrink-0 flex-col justify-between border-l border-dashed border-[#6B7280] bg-[#F7F4EC] p-2 text-center">
          <div>
            <div className="rounded-sm bg-[#0B4D2C] py-0.5">
              <p className="text-[8px] font-bold tracking-widest text-white">
                KSP
              </p>
            </div>
            <p className="text-[5px] text-[#6B7280]">ADMIT ONE</p>
          </div>
          <div>
            <p className="text-[6px] font-bold text-[#0B4D2C]">
              {categoryName}
            </p>
            <p className="text-[9px] font-bold text-[#1F2937]">{serial}</p>
          </div>
          <div>
            <p className="text-[5px] text-[#6B7280]">KEEP THIS STUB</p>
            <p className="text-[6px] text-[#1F2937]">
              {formatCalendarDate(event.eventDate)}
            </p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Preview at ~50% of the printed 210 × 59 mm artwork (printed tickets
        are ~94% of that on a 5-per-A4 sheet). Print a sample before the
        production run.
      </p>
    </div>
  );
}
