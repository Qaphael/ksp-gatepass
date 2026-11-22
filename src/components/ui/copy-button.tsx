"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface CopyButtonProps {
  value: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * CopyButton: copies a string to clipboard with a brief check confirmation.
 * Renders an outline button with Copy icon that temporarily shows Check on success.
 */
export function CopyButton({ value, className, "aria-label": ariaLabel = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may fail in some contexts; silently ignore.
    }
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("min-h-0 min-w-0", className)}
      onClick={handleClick}
      aria-label={ariaLabel}
      disabled={copied}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </Button>
  );
}