import type { ApiFailure } from "@/lib/api-client";

/** Renders a safe API error (with per-field details when provided). */
export function FormAlert({ error }: { error: ApiFailure | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      {error.details && error.details.length > 0 ? (
        <ul className="mt-1 list-inside list-disc">
          {error.details.map((detail) => (
            <li key={detail.path}>{detail.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
