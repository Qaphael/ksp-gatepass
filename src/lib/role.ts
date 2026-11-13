import type { Role } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  SELLER: "Ticket seller",
  VERIFIER: "Entrance verifier",
  SUPERVISOR: "Supervisor",
};
