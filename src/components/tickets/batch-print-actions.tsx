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
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/api/v1/ticket-batches/${batchId}/print.pdf?mode=sample`}
                />
              }
            >
              <Printer /> Print sample (1 ticket)
            </Button>
            <Button
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
          PDFs are A4 portrait with 5 tickets per page and dashed cut guides.
          Print a sample first and check that the QR and serial are readable.
        </p>
      ) : null}
    </div>
  );
}
