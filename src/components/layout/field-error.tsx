import type { ApiFailure } from "@/lib/api-client";

export function FieldError({ error, field }: { error: ApiFailure | null; field: string }) {
  const message = error?.details?.find((detail) => detail.path === field)?.message;
  return message ? <p id={`${field}-error`} className="text-base text-danger-foreground">{message}</p> : null;
}
