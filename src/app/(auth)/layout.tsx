import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/logo-mark";
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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="text-center">
        <Link href="/" className="inline-flex flex-col items-center gap-3">
          <LogoMark className="size-16 text-primary" />
          <span className="text-xl font-semibold tracking-tight">KSP GatePass</span>
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          Ticket sales and gate verification
        </p>
      </div>
      {children}
    </main>
  );
}
