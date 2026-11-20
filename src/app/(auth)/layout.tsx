import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

// Redirects signed-in users; needs the session cookie per request.
export const instant = false;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (ctx) redirect("/dashboard");

  return (
    <main className="min-h-dvh bg-background">
      {children}
    </main>
  );
}