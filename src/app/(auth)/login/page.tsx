"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Lock, Mail, Loader2, X, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      {/* Branding header */}
      <div className="flex flex-col items-center gap-2">
        <Link href="/" className="inline-flex flex-col items-center gap-2">
          <div className="grid size-14 place-items-center rounded-lg bg-accent text-primary shadow-card">
            <Badge className="size-6" />
          </div>
          <span className="text-xl font-semibold text-foreground">KSP GatePass</span>
        </Link>
        <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
          KSP Hotel Gulu · Africa/Kampala
        </p>
      </div>

      {/* Auth card — surface tier */}
      <div className="w-full max-w-sm bg-card rounded-lg border border-input p-6 flex flex-col gap-5 shadow-card">
        {/* Title & context */}
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg font-semibold">Sign in</CardTitle>
          <CardDescription className="text-sm">
            Use your username or email to continue.
          </CardDescription>
        </div>

        {/* Active error banner */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertCircle className="mx-0.5 size-4 text-destructive" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-destructive">{error.message}</p>
            </div>
            <button
              onClick={() => setError(null)}
              type="button"
              className="text-destructive/60 hover:text-destructive p-1 inline-flex items-center justify-center"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Sign in form */}
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {/* Username/Email field */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="identifier" className="text-xs font-medium text-muted-foreground">
                Username or email
              </Label>
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
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
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
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

          {/* Role quick-indicator helper pill */}
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge className="size-4 text-secondary" />
              <span className="text-[10px] font-mono text-muted-foreground truncate">Active Role:</span>
            </div>
            <span className="text-[10px] font-mono text-primary font-medium">Admin / Verifier / Seller</span>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={loading}
            className="min-h-[48px] w-full font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin size-4 mr-2" />
                Signing in…
              </>
            ) : (
              <>
                Sign in <Mail className="size-4 ml-1" />
              </>
            )}
          </Button>
        </form>

        {/* Access / support footer */}
        <footer className="pt-2 text-center flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Need access?{" "}
            <Link href="/" className="text-primary font-medium underline underline-offset-2 hover:underline">
              Ask an administrator
            </Link>
          </p>
          <p className="text-[10px] font-mono text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">
              Help & Support
            </Link>
          </p>
        </footer>
      </div>

      {/* Live system telemetry status pill */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground shadow-card">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-[10px] font-mono tracking-tight">Server online · Africa/Kampala (EAT)</span>
        </div>
      </div>
    </main>
  );
}
