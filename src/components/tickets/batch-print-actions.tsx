import { ArrowRight, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatchPrintActionsProps {
  batchId: string;
  eventId: string;
  quantity: number;
  canPrint: boolean;
  canExport: boolean;
  templateReady: boolean;
}

/**
 * Print downloads are plain authenticated links: the browser sends the session
 * cookie, the server audits the output, and each download is traceable to a
 * PrintBatch record (PRD 5.6 rules 6–8).
 */
export function BatchPrintActions({
  batchId,
  eventId,
  quantity,
  canPrint,
  canExport,
  templateReady,
}: BatchPrintActionsProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Primary row button */}
      {canPrint && templateReady ? (
        <Button
          nativeButton={false}
          className="w-full min-h-[52px] rounded-lg justify-between"
          render={
            <a href={`/api/v1/ticket-batches/${batchId}/print.pdf`} />
          }
        >
          <div className="flex items-center gap-3">
            <Printer className="size-6" />
            <div className="text-left">
              <p className="text-base font-semibold">Download print sheet</p>
              <p className="text-[11px] font-mono text-muted-foreground">{quantity} tickets with QR</p>
            </div>
          </div>
          <ArrowRight className="size-5" />
        </Button>
      ) : null}

      {/* Secondary row: Print test and Export CSV */}
      <div className="grid grid-cols-2 gap-2">
        {canPrint && templateReady ? (
          <Button
            nativeButton={false}
            variant="outline"
            className="min-h-12 rounded-lg justify-start gap-2 p-3"
            render={
              <a href={`/api/v1/ticket-batches/${batchId}/print.pdf?mode=sample`} />
            }
          >
            <Printer className="size-4" />
            <div className="text-left">
              <p className="text-sm font-medium">Print test</p>
              <p className="text-[11px] font-mono text-muted-foreground">One ticket</p>
            </div>
          </Button>
        ) : (
          <div className="min-h-12 rounded-lg bg-card border p-3 text-center text-muted-foreground text-xs">
            Template not ready
          </div>
        )}
        {canExport ? (
          <Button
            nativeButton={false}
            variant="outline"
            className="min-h-12 rounded-lg justify-start gap-2 p-3"
            render={
              <a href={`/api/v1/tickets/export?eventId=${eventId}&batchId=${batchId}`} />
            }
          >
            <FileDown className="size-4" />
            <div className="text-left">
              <p className="text-sm font-medium">Export CSV</p>
              <p className="text-[11px] font-mono text-muted-foreground">Batch manifest</p>
            </div>
          </Button>
        ) : (
          <div className="min-h-12 rounded-lg bg-card border p-3 text-center text-muted-foreground text-xs">
            No export permission
          </div>
        )}
      </div>

      {/* A4 guidance paragraph */}
      {canPrint && templateReady ? (
        <p className="text-xs text-muted-foreground">
          Sample is one ticket on A4. Print at 100% / Actual size (turn off
          &ldquo;Fit to page&rdquo;), then measure the artwork and scan the paper QR before
          printing the full sheet. Production PDFs use 5 tickets per A4 page.
        </p>
      ) : null}
    </div>
  );
}