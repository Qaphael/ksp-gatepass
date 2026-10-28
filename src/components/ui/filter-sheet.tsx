"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function FilterSheet({ children, activeCount = 0 }: { children: ReactNode; activeCount?: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="hidden md:block">{children}</div>
    <div className="md:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button type="button" variant="outline" className="w-full justify-between" />}>
          <span className="inline-flex items-center gap-2"><SlidersHorizontal aria-hidden="true" /> Filters</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm">{activeCount} active</span>
        </DialogTrigger>
        <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
          <DialogHeader><DialogTitle>Filters</DialogTitle><DialogDescription>Choose filters, then apply them to the list.</DialogDescription></DialogHeader>
          <div className="max-h-[65dvh] overflow-y-auto">{children}</div>
        </DialogContent>
      </Dialog>
    </div>
  </>;
}
