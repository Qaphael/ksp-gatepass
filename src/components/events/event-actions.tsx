"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

const CONFIRM_MESSAGES: Record<string, string> = {
  complete:
    "Complete this event? Sales and admission will be closed and the event can no longer be reopened.",
  archive:
    "Archive this event? It will no longer accept sales, check-ins or edits.",
};

export function EventActions({ event, permissions }: EventActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function run(action: string, path: string) {
    const confirmMessage = CONFIRM_MESSAGES[action];
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setPending(action);
    try {
      const result = await apiFetch<{ event: EventDto }>(
        `/api/v1/events/${event.id}/${path}`,
        { method: "POST" },
      );
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(actionTitle(action));
      router.refresh();
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
        <Button
          key={button.action}
          variant={button.variant ?? "outline"}
          size="sm"
          disabled={pending !== null}
          onClick={() => void run(button.action, button.path)}
        >
          {pending === button.action ? (
            <Loader2 className="animate-spin" />
          ) : null}
          {button.label}
        </Button>
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
