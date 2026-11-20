"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";
import { apiFetch, type ApiFailure } from "@/lib/api-client";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // A full navigation makes the newly set HttpOnly session cookie authoritative
    // before the protected dashboard is requested.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-5xl lg:grid lg:grid-cols-2 lg:items-stretch lg:gap-10 lg:rounded-lg lg:border lg:border-input lg:bg-card lg:p-10 lg:shadow-card lg:overflow-hidden">
        {/* Left info panel — desktop only */}
        <div className="hidden lg:flex flex-col gap-8 border-r border-input pr-10">
          <BrandLockup />

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              KSP Hotel Gulu · Africa/Kampala
            </p>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              GatePass operations console
            </h1>
            <p className="text-sm text-muted-foreground">
              One secure sign-in for ticketing, sales, scanning and gate
              verification across your event.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            <Feature icon={ScanLine} title="Handheld scanning"
              body="Verified QR and manual-serial check-in with one shared eligibility path." />
            <Feature icon={KeyRound} title="Every seat accounted for"
              body="Live ticket inventory, sales, payments and admission status kept separate and reconciled." />
            <Feature icon={ShieldCheck} title="Role-scoped access"
              body="Server-enforced permissions pair each staff member with only the tools they need." />
          </ul>

          <div className="mt-auto flex items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-muted-foreground">
            <span className="text-[11px] font-mono tracking-tight">
              KSP Hotel Gulu · Africa/Kampala
            </span>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="flex w-full flex-col gap-5">
          {/* Branding header — mobile only */}
          <div className="flex flex-col items-center gap-2 lg:hidden">
            <Link href="/" aria-label="KSP GatePass home" className="inline-flex flex-col items-center gap-2">
              <LogoMark className="size-14 text-primary" />
              <span className="text-xl font-semibold text-foreground">KSP GatePass</span>
            </Link>
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
              KSP Hotel Gulu · Africa/Kampala
            </p>
          </div>

          {/* Auth card — surface tier */}
          <div className="w-full rounded-lg border border-input bg-card p-6 shadow-card flex flex-col gap-5">
            {/* Title & context */}
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg font-semibold">Staff sign in</CardTitle>
              <CardDescription className="text-sm">
                Use your username or email to continue.
              </CardDescription>
            </div>

            {/* Active error banner */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="mx-0.5 size-4 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono text-destructive">{error.message}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  type="button"
                  className="inline-flex items-center justify-center p-1 text-destructive/60 hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* Sign in form */}
            <form onSubmit={onSubmit} method="post" className="flex flex-col gap-4" noValidate>
              {/* Username/Email field */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identifier" className="text-xs font-medium text-muted-foreground">
                  Username or email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="identifier"
                    name="identifier"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    className="pl-10 text-sm"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                    Password
                  </Label>
                  <span className="text-[10px] font-mono text-muted-foreground">Case-sensitive</span>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="pr-10 text-sm"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              {/* Submit button */}
              <Button type="submit" disabled={loading} className="min-h-[48px] w-full font-medium">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <Mail className="ml-1 size-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Access / support footer */}
            <footer className="flex flex-col gap-1 pt-2 text-center">
              <p className="text-xs text-muted-foreground">
                Need access?{" "}
                <Link href="/" className="font-medium text-primary underline underline-offset-2 hover:underline">
                  Ask an administrator
                </Link>
              </p>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}

function BrandLockup() {
  return (
    <Link href="/" aria-label="KSP GatePass home" className="inline-flex items-center gap-2.5">
      <LogoMark className="size-10 text-primary" />
      <span className="text-lg font-semibold text-foreground">KSP GatePass</span>
    </Link>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ScanLine;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{body}</span>
      </div>
    </li>
  );
}