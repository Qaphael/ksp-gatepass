"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, X } from "lucide-react";

export function SearchBox({
  currentSearch,
  eventId,
  status,
}: {
  currentSearch?: string;
  eventId?: string;
  status?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentSearch ?? "");

  function buildParams(searchValue: string) {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (status) params.set("status", status);
    if (searchValue) params.set("search", searchValue);
    params.set("page", "1");
    return params;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const s = (formData.get("search") as string) ?? "";
    router.push(`/sales?${buildParams(s).toString()}`);
  }

  function handleClear() {
    setValue("");
    router.push(`/sales?${buildParams("").toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative w-full max-w-md"
    >
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
        <SearchIcon className="size-5 shrink-0" aria-hidden="true" />
      </span>
      <Input
        name="search"
        defaultValue={currentSearch}
        placeholder="Search REF-…, buyer name, phone…"
        className="w-full h-12 pl-10 pr-9 bg-card rounded-xl border border-input text-base placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value ? (
        <Button type="button" variant="outline" size="icon-sm" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={handleClear} aria-label="Clear search">
          <X className="size-4" />
        </Button>
      ) : null}
    </form>
  );
}
