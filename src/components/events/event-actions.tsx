"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { apiFetch } from "@/lib/api-client";
import type { EventDto } from "@/server/services/events.service";

export interface EventActionPermissions {
  openSales: boolean;
  closeSales: boolean;
  openAdmission: boolean;
  closeAdmission: boolean;
  complete: boolean;
  archive: boolean;
}

interface EventActionsProps {
  event: EventDto;
  permissions: EventActionPermissions;
}

export function EventActions({ event, permissions }: EventActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function run(action: string, path: string): Promise<boolean> {
    setPending(action);
    try {
      const result = await apiFetch<{ event: EventDto }>(
        `/api/v1/events/${event.id}/${path}`,
        { method: "POST" },
      );
      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      toast.success(actionTitle(action));
      router.refresh();
      return true;
    } catch {
      toast.error("Could not reach the server. Try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  const allButtons: Array<{
    action: string;
    path: string;
    label: string;
    allowed: boolean;
    variant?: "outline" | "destructive" | "default";
  }> = [
    {
      action: "open-sales",
      path: "open-sales",
      label: "Open sales",
      allowed: permissions.openSales && !event.salesOpen,
      variant: "default",
    },
    {
      action: "close-sales",
      path: "close-sales",
      label: "Close sales",
      allowed: permissions.closeSales && event.salesOpen,
      variant: "outline",
    },
    {
      action: "open-admission",
      path: "open-admission",
      label: "Open admission",
      allowed: permissions.openAdmission && !event.admissionOpen,
      variant: "default",
    },
    {
      action: "close-admission",
      path: "close-admission",
      label: "Close admission",
      allowed: permissions.closeAdmission && event.admissionOpen,
      variant: "outline",
    },
    {
      action: "complete",
      path: "complete",
      label: "Complete event",
      allowed: permissions.complete && event.status !== "COMPLETED" && event.status !== "ARCHIVED",
      variant: "outline",
    },
    {
      action: "archive",
      path: "archive",
      label: "Archive event",
      allowed: permissions.archive && event.status !== "ARCHIVED",
      variant: "destructive",
    },
  ];
  const buttons = allButtons.filter((button) => button.allowed);

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((button) => (
        button.action === "complete" || button.action === "archive" ? <ConfirmSheet
          key={button.action}
          trigger={<Button variant={button.variant ?? "outline"} size="sm" className="min-h-12 text-base" disabled={pending !== null}>{pending === button.action ? <Loader2 className="animate-spin" /> : null}{button.label}</Button>}
          title={`${button.label} “${event.name}”?`}
          description={button.action === "complete" ? "Sales and admission will close, and the event cannot be reopened." : "The event will no longer accept sales, check-ins, or edits."}
          details={<p className="font-semibold">{event.name} · {event.venue}</p>}
          confirmLabel={button.label}
          destructive={button.action === "archive"}
          onConfirm={() => run(button.action, button.path)}
        /> : <Button
          key={button.action}
          variant={button.variant ?? "outline"}
          size="sm"
          className="min-h-12 text-base"
          disabled={pending !== null}
          onClick={() => void run(button.action, button.path)}
        >{pending === button.action ? <Loader2 className="animate-spin" /> : null}{button.label}</Button>
      ))}
    </div>
  );
}

function actionTitle(action: string): string {
  switch (action) {
    case "open-sales":
      return "Sales opened.";
    case "close-sales":
      return "Sales closed.";
    case "open-admission":
      return "Admission opened.";
    case "close-admission":
      return "Admission closed.";
    case "complete":
      return "Event completed.";
    case "archive":
      return "Event archived.";
    default:
      return "Done.";
  }
}
