"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/layout/form-alert";
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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use your username or email to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormAlert error={error} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="identifier">Username or email</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="pr-10"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                disabled={loading}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : null}
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Need access? Ask an administrator.{" "}
            <Link href="/" className="underline underline-offset-2">
              Help
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
