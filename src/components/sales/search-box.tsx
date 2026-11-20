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
      className="flex items-center gap-2 w-full max-w-md rounded-lg border border-input bg-card px-3 py-2"
    >
      <Input
        name="search"
        defaultValue={currentSearch}
        placeholder="Search by reference, customer name or phone"
        className="flex-1 min-w-0 border-none bg-transparent focus-visible:ring-0"
      />
      {value ? (
        <Button type="button" variant="outline" size="icon-sm" onClick={handleClear} aria-label="Clear search">
          <X className="size-4" />
        </Button>
      ) : null}
      <Button type="submit" variant="outline" size="icon-sm" aria-label="Search">
        <SearchIcon className="size-4" />
      </Button>
    </form>
  );
}
