"use client";

/**
 * Small client-side API helper. Network failures are surfaced as a distinct
 * code so screens can say "could not reach the server" instead of implying
 * success (PRD 11.5 — never present unconfirmed actions as successful).
 */
export interface ApiFieldIssue {
  path: string;
  message: string;
}

export interface ApiFailure {
  code: string;
  message: string;
  details?: ApiFieldIssue[];
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiFailure; status: number };

export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: {
        code: "NETWORK",
        message: "Could not reach the server. Check your connection and try again.",
      },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body; fall through to generic handling below.
  }

  if (!response.ok) {
    const error = (payload as { error?: ApiFailure } | null)?.error;
    return {
      ok: false,
      status: response.status,
      error: error ?? {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    };
  }

  return { ok: true, status: response.status, data: payload as T };
}
