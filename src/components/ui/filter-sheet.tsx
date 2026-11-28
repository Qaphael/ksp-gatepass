"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Desktop inline filters; a ReUI Sheet below md. */
export function FilterSheet({ children, activeCount = 0 }: { children: ReactNode; activeCount?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="hidden md:block">{children}</div>
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button type="button" variant="outline" className="w-full justify-between" />}>
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" />
              Filters
            </span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{activeCount} active</span>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Choose filters, then apply them to the list.</SheetDescription>
            </SheetHeader>
            <div className="px-4">{children}</div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
