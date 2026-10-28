import { Download, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatchPrintActionsProps {
  batchId: string;
  eventId: string;
  quantity: number;
  canPrint: boolean;
  canExport: boolean;
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
}: BatchPrintActionsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canPrint ? (
          <>
            <Button
              nativeButton={false}
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/api/v1/ticket-batches/${batchId}/print.pdf?mode=sample`}
                />
              }
            >
              <Printer /> One-page print test sheet
            </Button>
            <Button
              nativeButton={false}
              size="sm"
              render={
                <a href={`/api/v1/ticket-batches/${batchId}/print.pdf`} />
              }
            >
              <FileDown /> Download print sheet ({quantity} tickets)
            </Button>
          </>
        ) : null}
        {canExport ? (
          <Button
            nativeButton={false}
            size="sm"
            variant="ghost"
            render={
              <a href={`/api/v1/tickets/export?eventId=${eventId}&batchId=${batchId}`} />
            }
          >
            <Download /> Export batch CSV
          </Button>
        ) : null}
      </div>
      {canPrint ? (
        <p className="text-xs text-muted-foreground">
          Sample is one ticket on A4. Print at 100% / Actual size (turn off
          “Fit to page”), then measure the artwork and scan the paper QR before
          printing the full sheet. Production PDFs use 5 tickets per A4 page.
        </p>
      ) : null}
    </div>
  );
}
