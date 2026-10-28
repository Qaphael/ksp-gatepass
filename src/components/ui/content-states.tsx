"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed bg-card px-5 py-10 text-center">
      <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="max-w-prose text-base text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 rounded-xl border border-danger/40 bg-danger/50 px-5 py-8 text-center text-danger-foreground">
      <AlertCircle aria-hidden="true" className="size-8" />
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-prose text-base">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-xl border bg-card p-4 shadow-card">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-label="Loading" role="status" className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => <CardSkeleton key={index} />)}
      <span className="sr-only">Loading</span>
    </div>
  );
}
