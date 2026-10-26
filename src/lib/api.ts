import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSessionContext, type AuthContext } from "@/lib/auth/session";

/**
 * Stable error codes (PRD 10.7). Messages are safe for clients; stack traces,
 * database details and tokens are never included.
 */
export const ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldIssue {
  path: string;
  message: string;
}

/** Domain errors thrown by services and mapped to HTTP by the handler. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldIssue[],
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function jsonError(
  status: number,
  code: ErrorCode,
  message: string,
  details?: FieldIssue[],
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Maps a ZodError to a 422 validation response with field-level details. */
export function zodErrorResponse(error: ZodError): NextResponse {
  const details: FieldIssue[] = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return jsonError(
    422,
    ERROR_CODES.VALIDATION_ERROR,
    "Some fields are invalid.",
    details,
  );
}

/** Never leak internals: log server-side, return a generic 500. */
export function internalErrorResponse(error: unknown): NextResponse {
  console.error("[api] unhandled error:", error);
  return jsonError(
    500,
    ERROR_CODES.INTERNAL_ERROR,
    "Something went wrong. Please try again.",
  );
}

export function errorToResponse(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return zodErrorResponse(error);
  }
  return internalErrorResponse(error);
}

/** Reads a JSON body; malformed JSON is a 422, not a 500. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "Request body must be valid JSON.",
    );
  }
}

/** First hop of X-Forwarded-For (set by the reverse proxy in production). */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

type RouteParams = Record<string, string>;

/**
 * Wraps an authenticated route handler: resolves the session (401 when
 * missing/invalid), awaits route params, and maps every thrown error to a
 * safe JSON response. Permission checks happen inside the services.
 */
export function apiHandler<P extends RouteParams>(
  handler: (ctx: AuthContext, req: NextRequest, params: P) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    context: { params: Promise<P> },
  ): Promise<NextResponse> => {
    try {
      const ctx = await getSessionContext();
      if (!ctx) {
        return jsonError(401, ERROR_CODES.UNAUTHENTICATED, "Please sign in.");
      }
      const params = await context.params;
      return await handler(ctx, req, params);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}

/** Same error mapping as apiHandler, without requiring a session. */
export function publicApiHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}
