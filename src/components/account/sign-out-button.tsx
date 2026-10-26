"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      disabled={signingOut}
      onClick={() => void signOut()}
    >
      {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
      {signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
