import { z } from "zod";
import { passwordSchema } from "./auth";

export const ROLE_VALUES = ["ADMIN", "SELLER", "VERIFIER", "SUPERVISOR"] as const;

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
    "Use letters, numbers, dots, dashes or underscores.",
  )
  .transform((value) => value.toLowerCase());

const emailSchema = z
  .email()
  .max(200)
  .transform((value) => value.toLowerCase());

/** Admin-only account creation (PRD 5.15). No self-registration exists. */
export const createUserSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  username: usernameSchema,
  email: emailSchema.nullish(),
  role: z.enum(ROLE_VALUES),
  password: passwordSchema,
  contactPhone: z.string().trim().max(30).nullish(),
});

/**
 * Allowed account edits. Username is immutable (identity for audit history)
 * and password changes go through their own flows.
 */
export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    email: emailSchema.nullish(),
    role: z.enum(ROLE_VALUES),
    contactPhone: z.string().trim().max(30).nullish(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "No fields to update.",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
