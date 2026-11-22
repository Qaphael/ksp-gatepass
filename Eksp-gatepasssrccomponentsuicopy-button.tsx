"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CopyButton({ textToCopy, ariaLabel = "Copy to clipboard" }: { textToCopy: string; ariaLabel?: string }) {
  const [copied, setCopied] = useState(false);

  // Check if clipboard API is available (requires HTTPS or localhost)
  // This runs during render but is just a boolean check - no side effects
  const canCopy = typeof window !== "undefined" && window.isSecureContext && !!navigator.clipboard;

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!canCopy) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11"
      onClick={handleCopy}
      aria-label={ariaLabel}
      aria-pressed={copied}
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </Button>
  );
}
