"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filters } from "@/components/reui/filters/filters";
import {
  createFilterQuery,
  createFilterRule,
  flattenFilterConditions,
} from "@/components/reui/filters/filters-query";
import type { FilterField, FilterQuery } from "@/components/reui/filters/filters-types";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";

export type UrlFilterOption = {
  value: string;
  label: string;
};

export type UrlFilterFieldConfig = {
  id: string;
  label: string;
  type: "text" | "select";
  options?: UrlFilterOption[];
  placeholder?: string;
  searchable?: boolean;
};

function buildInitialQuery(
  fields: UrlFilterFieldConfig[],
  initialValues: Record<string, string | undefined>,
): FilterQuery {
  const rules = fields.flatMap((field) => {
    const raw = initialValues[field.id]?.trim();
    if (!raw) return [];
    return [
      createFilterRule({
        id: `init-${field.id}`,
        path: [field.id],
        operator: field.type === "select" ? "is" : "contains",
        value: raw,
      }),
    ];
  });
  return createFilterQuery(rules);
}

function queryToParams(
  query: FilterQuery,
  preserveParams?: Record<string, string | undefined>,
  resetPage = true,
): URLSearchParams {
  const search = new URLSearchParams();
  if (preserveParams) {
    for (const [k, v] of Object.entries(preserveParams)) {
      if (v) search.set(k, v);
    }
  }
  const conditions = flattenFilterConditions(query);
  for (const cond of conditions) {
    const key = cond.path[0];
    const value = cond.values[0];
    if (key && typeof value === "string" && value.trim() !== "") {
      search.set(key, value.trim());
    }
  }
  if (resetPage && search.toString() !== "") {
    search.set("page", "1");
  }
  return search;
}

type UrlFiltersBarProps = {
  basePath: string;
  fields: UrlFilterFieldConfig[];
  initialValues: Record<string, string | undefined>;
  preserveParams?: Record<string, string | undefined>;
  resetPage?: boolean;
  applyLabel?: string;
};

function UrlFiltersBarInner({
  basePath,
  fields,
  initialValues,
  preserveParams,
  resetPage = false,
  applyLabel = "Apply",
}: UrlFiltersBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState<FilterQuery>(() =>
    buildInitialQuery(fields, initialValues),
  );

  const filterFields = useMemo<FilterField[]>(
    () =>
      fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        defaultOperator: field.type === "select" ? "is" : "contains",
        placeholder: field.placeholder,
        searchable: field.searchable ?? (field.options ? field.options.length > 6 : true),
        options: field.options,
      })),
    [fields],
  );

  function navigateWithQuery(nextQuery: FilterQuery) {
    const params = queryToParams(nextQuery, preserveParams, resetPage);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleQueryChange(next: FilterQuery) {
    setQuery(next);
    if (next.rules.length === 0 && Object.values(initialValues).some(Boolean)) {
      navigateWithQuery(next);
    }
  }

  return (
    <Frame spacing="default">
      <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <Filters
            fields={filterFields}
            query={query}
            onQueryChange={handleQueryChange}
            showClear
            size="sm"
            className="w-full min-w-0 [&_[data-slot=filter-chip]]:max-w-full [&_[data-slot=filter-chip]]:min-w-0 [&_[data-slot=filter-chip]_[data-slot=button-group-text]]:min-w-0 [&_[data-slot=filter-chip]_[data-slot=button-group-text]]:truncate [&_[data-slot=filter-chip]_[data-slot=button-group-text]]:max-w-[11rem] sm:[&_[data-slot=filter-chip]_[data-slot=button-group-text]]:max-w-none"
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => navigateWithQuery(query)}
        >
          {applyLabel}
        </Button>
      </FramePanel>
    </Frame>
  );
}

export function UrlFiltersBar(props: UrlFiltersBarProps) {
  return <UrlFiltersBarInner key={JSON.stringify(props.initialValues)} {...props} />;
}
