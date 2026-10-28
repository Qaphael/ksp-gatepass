"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  return <section role="alert" className="mx-auto flex max-w-lg flex-col items-start gap-3 rounded-xl border border-danger/40 bg-card p-6">
    <h1 className="text-lg font-semibold">This page could not load</h1>
    <p className="text-base text-muted-foreground">Check your connection and try again.</p>
    <Button className="min-h-11" onClick={() => retry()}>Try again</Button>
  </section>;
}
