"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/layout/form-alert";
import { apiFetch, type ApiFailure } from "@/lib/api-client";

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY: FormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function ChangePasswordForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirmPassword) {
      setError({
        code: "VALIDATION_ERROR",
        message: "New passwords do not match.",
        details: [{ path: "confirmPassword", message: "New passwords do not match." }],
      });
      return;
    }
    setSaving(true);
    const result = await apiFetch("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    toast.success("Password changed. Other devices were signed out.");
    setForm(EMPTY);
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={form.currentPassword}
            onChange={(e) => set("currentPassword", e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={form.newPassword}
            onChange={(e) => set("newPassword", e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            disabled={saving}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Minimum 12 characters.</p>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
