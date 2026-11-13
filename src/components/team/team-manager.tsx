"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldCheck, UserMinus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
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
import { FieldError } from "@/components/layout/field-error";
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
type PendingUserAction = { kind: "role"; user: UserDto; role: Role } | { kind: "deactivate"; user: UserDto };

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
  const [pendingUserAction, setPendingUserAction] = useState<PendingUserAction | null>(null);

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
    setPendingUserAction({ kind: "role", user, role });
  }

  async function confirmUserAction() {
    if (!pendingUserAction) return;
    const { user } = pendingUserAction;
    setBusyUserId(user.id);
    try {
      const result = pendingUserAction.kind === "role"
        ? await apiFetch<{ user: UserDto }>(`/api/v1/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role: pendingUserAction.role }) })
        : await apiFetch<{ user: UserDto }>(`/api/v1/users/${user.id}/deactivate`, { method: "POST" });
      if (!result.ok) throw new Error(result.error.message);
      toast.success(pendingUserAction.kind === "role" ? "Role updated." : "Account deactivated.");
      router.refresh();
      return true;
    } finally {
      setBusyUserId(null);
    }
  }

  async function onDeactivate(user: UserDto) {
    setPendingUserAction({ kind: "deactivate", user });
  }

  return (
    <div className="flex flex-col gap-3">
      {pendingUserAction ? <ConfirmSheet open onOpenChange={(next) => { if (!next) { if (pendingUserAction.kind === "role") router.refresh(); setPendingUserAction(null); } }} title={pendingUserAction.kind === "role" ? `Change ${pendingUserAction.user.displayName}'s role?` : `Deactivate ${pendingUserAction.user.displayName}?`} description={pendingUserAction.kind === "role" ? "This changes the account's access immediately." : "Their sessions end immediately and they will no longer be able to sign in."} details={pendingUserAction.kind === "role" ? <p>{ROLE_LABELS[pendingUserAction.user.role]} → {ROLE_LABELS[pendingUserAction.role]}</p> : <p className="font-semibold">@{pendingUserAction.user.username}</p>} confirmLabel={pendingUserAction.kind === "role" ? "Change role" : "Deactivate account"} destructive={pendingUserAction.kind === "deactivate"} onConfirm={confirmUserAction} /> : null}
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
            <DialogContent className="top-auto bottom-0 left-0 max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-[18px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:top-1/2 md:left-1/2 md:w-[calc(100%-3rem)] md:max-w-3xl md:max-h-[calc(100dvh-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[18px]">
              <DialogHeader className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border/70 pb-4">
                <span className="grid size-11 place-items-center rounded-[14px] bg-accent text-primary" aria-hidden="true"><UserRound className="size-5" /></span>
                <div className="grid min-w-0 gap-2">
                  <DialogTitle>Add team member</DialogTitle>
                  <DialogDescription>Set up their profile and sign-in access.</DialogDescription>
                </div>
              </DialogHeader>
              <form onSubmit={onCreate} className="grid gap-4" noValidate>
                <FormAlert error={error} />
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
                  <section className="grid content-start gap-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><UserRound className="size-4 text-primary" aria-hidden="true" />Personal details</h3>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-name">Full name</Label>
                      <Input id="user-name" required autoComplete="name" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} disabled={saving} />
                      <FieldError error={error} field="displayName" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-username">Username</Label>
                      <Input id="user-username" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={(e) => set("username", e.target.value)} disabled={saving} />
                      <FieldError error={error} field="username" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-email">Email (optional)</Label>
                      <Input id="user-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={saving} />
                      <FieldError error={error} field="email" />
                    </div>
                  </section>
                  <section className="grid content-start gap-4 border-t border-border/70 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />Sign-in access</h3>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-role">Role</Label>
                      <Select value={form.role} onValueChange={(value) => set("role", value as Role)}>
                        <SelectTrigger id="user-role" className="min-h-12 w-full text-base" disabled={saving}><SelectValue>{ROLE_LABELS[form.role]}</SelectValue></SelectTrigger>
                        <SelectContent>{ROLE_VALUES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
                      </Select>
                      <FieldError error={error} field="role" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-password">Temporary password</Label>
                      <Input id="user-password" type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={(e) => set("password", e.target.value)} disabled={saving} />
                      <FieldError error={error} field="password" />
                      <p className="text-sm leading-relaxed text-muted-foreground">At least 12 characters. Ask them to change it after their first sign-in.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="user-phone">Phone (optional)</Label>
                      <Input id="user-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} disabled={saving} />
                      <FieldError error={error} field="contactPhone" />
                    </div>
                  </section>
                </div>
                  <DialogFooter className="sticky bottom-0 gap-2 border-t bg-popover pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {saving ? "Adding…" : "Add member"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <ResponsiveList cards={users.length === 0 ? <Card><CardContent className="p-6 text-base text-muted-foreground">No team members yet. Add a member to get started.</CardContent></Card> : users.map((user) => {
        const isSelf = user.id === currentUserId;
        const isSuperAdmin = user.role === "SUPER_ADMIN";
        return <article key={user.id} className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-semibold">{user.displayName}{isSelf ? " (you)" : ""}</p><p className="truncate text-sm text-muted-foreground">@{user.username}</p>{user.email && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}</div><Badge variant="outline" className={user.active ? "border-success/40 bg-success/10 text-success-foreground" : "border-border bg-muted text-muted-foreground"}>{user.active ? "✓ Active" : "○ Deactivated"}</Badge></div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Role</span>{canManage && !isSelf && !isSuperAdmin ? <Select value={user.role} onValueChange={(value) => void onChangeRole(user, value as Role)} disabled={busyUserId === user.id}><SelectTrigger className="min-h-11 w-40" aria-label={`Role for ${user.displayName}`}><SelectValue>{ROLE_LABELS[user.role]}</SelectValue></SelectTrigger><SelectContent>{ROLE_VALUES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent></Select> : <span className="text-base">{ROLE_LABELS[user.role]}{isSuperAdmin ? " · protected" : ""}</span>}</div>
          {canManage && user.active && !isSelf && !isSuperAdmin && <Button className="mt-3 min-h-11 w-full" variant="outline" disabled={busyUserId === user.id} onClick={() => void onDeactivate(user)}>{busyUserId === user.id ? <Loader2 className="animate-spin" /> : <UserMinus />}Deactivate</Button>}
        </article>;
      })} table={<Card>
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
                const isSuperAdmin = user.role === "SUPER_ADMIN";
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
                      {canManage && !isSelf && !isSuperAdmin ? (
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
                        <span>{ROLE_LABELS[user.role]}{isSuperAdmin ? " · protected" : ""}</span>
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
                      {canManage && user.active && !isSelf && !isSuperAdmin ? (
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
      </Card>} />
    </div>
  );
}
