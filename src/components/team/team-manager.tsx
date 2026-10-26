"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormAlert } from "@/components/layout/form-alert";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/role";
import type { Role } from "@/generated/prisma/client";
import type { UserDto } from "@/server/services/users.service";

const ROLE_VALUES: Role[] = ["ADMIN", "SELLER", "VERIFIER", "SUPERVISOR"];

interface TeamManagerProps {
  users: UserDto[];
  currentUserId: string;
  canManage: boolean;
}

interface CreateForm {
  displayName: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  contactPhone: string;
}

const EMPTY_FORM: CreateForm = {
  displayName: "",
  username: "",
  email: "",
  role: "SELLER",
  password: "",
  contactPhone: "",
};

export function TeamManager({
  users,
  currentUserId,
  canManage,
}: TeamManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      displayName: form.displayName,
      username: form.username,
      role: form.role,
      password: form.password,
      email: form.email === "" ? null : form.email,
      contactPhone: form.contactPhone === "" ? null : form.contactPhone,
    };
    const result = await apiFetch<{ user: UserDto }>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    toast.success(`${result.data.user.displayName} added to the team.`);
    setForm(EMPTY_FORM);
    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  async function onChangeRole(user: UserDto, role: Role) {
    if (role === user.role) return;
    if (
      !window.confirm(
        `Change ${user.displayName}'s role from ${ROLE_LABELS[user.role]} to ${ROLE_LABELS[role]}?`,
      )
    ) {
      router.refresh(); // reset the select
      return;
    }
    setBusyUserId(user.id);
    try {
      const result = await apiFetch<{ user: UserDto }>(`/api/v1/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Role updated.");
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function onDeactivate(user: UserDto) {
    if (
      !window.confirm(
        `Deactivate ${user.displayName}? Their sessions end immediately and they will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setBusyUserId(user.id);
    try {
      const result = await apiFetch<{ user: UserDto }>(
        `/api/v1/users/${user.id}/deactivate`,
        { method: "POST" },
      );
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Account deactivated.");
      router.refresh();
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setError(null);
                  }}
                >
                  <Plus /> Add team member
                </Button>
              }
            />
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
                <DialogDescription>
                  They will sign in with the username and password you set here.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
                <FormAlert error={error} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="user-name">Full name</Label>
                  <Input
                    id="user-name"
                    required
                    value={form.displayName}
                    onChange={(e) => set("displayName", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="user-username">Username</Label>
                  <Input
                    id="user-username"
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="user-email">Email (optional)</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(value) => set("role", value as Role)}
                  >
                    <SelectTrigger className="w-full" disabled={saving}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_VALUES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-password">Temporary password</Label>
                    <Input
                      id="user-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="user-phone">Phone (optional)</Label>
                    <Input
                      id="user-phone"
                      value={form.contactPhone}
                      onChange={(e) => set("contactPhone", e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum 12 characters. Ask them to change it after first sign-in.
                </p>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {saving ? "Adding…" : "Add member"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Username</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className={user.active ? "" : "opacity-60"}>
                    <td className="p-3">
                      <p className="font-medium">{user.displayName}</p>
                      {user.email ? (
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      ) : null}
                    </td>
                    <td className="p-3">@{user.username}</td>
                    <td className="p-3">
                      {canManage && !isSelf ? (
                        <Select
                          value={user.role}
                          onValueChange={(value) =>
                            void onChangeRole(user, value as Role)
                          }
                          disabled={busyUserId === user.id}
                        >
                          <SelectTrigger className="w-40" aria-label="Role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_VALUES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{ROLE_LABELS[user.role]}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={
                          user.active
                            ? "border-transparent bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                            : "border-border bg-muted text-muted-foreground"
                        }
                      >
                        {user.active ? "Active" : "Deactivated"}
                      </Badge>
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">you</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-right">
                      {canManage && user.active && !isSelf ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyUserId === user.id}
                          onClick={() => void onDeactivate(user)}
                        >
                          {busyUserId === user.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <UserMinus />
                          )}
                          Deactivate
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
