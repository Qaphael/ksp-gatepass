import {
  ERROR_CODES,
  ServiceError,
  type FieldIssue,
} from "@/lib/api";
import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/client";

/**
 * Domain errors for services. The base ServiceError and HTTP mapping live in
 * @/lib/api so route wrappers can import them without a cycle.
 */
export { ServiceError };

export function unauthenticated(message = "Please sign in."): ServiceError {
  return new ServiceError(401, ERROR_CODES.UNAUTHENTICATED, message);
}

export function forbidden(message = "You do not have permission to do that."): ServiceError {
  return new ServiceError(403, ERROR_CODES.FORBIDDEN, message);
}

export function notFound(message = "Not found."): ServiceError {
  return new ServiceError(404, ERROR_CODES.NOT_FOUND, message);
}

export function conflict(message: string): ServiceError {
  return new ServiceError(409, ERROR_CODES.CONFLICT, message);
}

export function validationError(message: string, details?: FieldIssue[]): ServiceError {
  return new ServiceError(422, ERROR_CODES.VALIDATION_ERROR, message, details);
}

/** Default-deny permission guard used at the top of every service operation. */
export function requirePermission(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw forbidden();
  }
}
