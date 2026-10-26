import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

// Auth gate reads the session cookie on every request.
export const instant = false;

export default async function Home() {
  const ctx = await getSessionContext();
  redirect(ctx ? "/dashboard" : "/login");
}
