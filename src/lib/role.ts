import type { Role } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  SELLER: "Ticket seller",
  VERIFIER: "Entrance verifier",
  SUPERVISOR: "Supervisor",
};
