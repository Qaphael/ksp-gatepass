"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTable, type ColumnDef } from "@tanstack/react-table";
import { PlusIcon, ShieldCheckIcon, UserMinusIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { FieldError } from "@/components/layout/field-error";
import { FormAlert } from "@/components/layout/form-alert";
import { Badge } from "@/components/reui/badge";
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { Role } from "@/generated/prisma/client";
import { apiFetch, type ApiFailure } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/role";
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

type PendingUserAction =
  | { kind: "role"; user: UserDto; role: Role }
  | { kind: "deactivate"; user: UserDto };

const EMPTY_FORM: CreateForm = {
  displayName: "",
  username: "",
  email: "",
  role: "SELLER",
  password: "",
  contactPhone: "",
};

export function TeamManager({ users, currentUserId, canManage }: TeamManagerProps) {
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
    toast.success(`${result.data.user.displayName} added`);
    setForm(EMPTY_FORM);
    setOpen(false);
    setSaving(false);
    router.refresh();
  }

  async function confirmUserAction() {
    if (!pendingUserAction) return;
    const { user } = pendingUserAction;
    setBusyUserId(user.id);
    try {
      const result =
        pendingUserAction.kind === "role"
          ? await apiFetch<{ user: UserDto }>(`/api/v1/users/${user.id}`, {
              method: "PATCH",
              body: JSON.stringify({ role: pendingUserAction.role }),
            })
          : await apiFetch<{ user: UserDto }>(`/api/v1/users/${user.id}/deactivate`, {
              method: "POST",
            });
      if (!result.ok) throw new Error(result.error.message);
      toast.success(pendingUserAction.kind === "role" ? "Role updated" : "Account deactivated");
      router.refresh();
      return true;
    } finally {
      setBusyUserId(null);
    }
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, UserDto>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: ({ column }) => <DataGridColumnHeader title="Member" column={column} />,
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUserId;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {user.displayName}
                {isSelf ? " (you)" : ""}
              </span>
              {user.email ? (
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              ) : null}
            </div>
          );
        },
        meta: { headerTitle: "Member" },
      },
      {
        accessorKey: "username",
        header: ({ column }) => <DataGridColumnHeader title="Username" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">@{row.original.username}</span>
        ),
        meta: { headerTitle: "Username" },
      },
      {
        accessorKey: "role",
        header: ({ column }) => <DataGridColumnHeader title="Role" column={column} />,
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUserId;
          const isSuperAdmin = user.role === "SUPER_ADMIN";
          if (canManage && !isSelf && !isSuperAdmin) {
            return (
              <NativeSelect
                size="sm"
                aria-label={`Role for ${user.displayName}`}
                value={user.role}
                disabled={busyUserId === user.id}
                onChange={(e) => {
                  const nextRole = e.target.value as Role;
                  if (nextRole !== user.role) {
                    setPendingUserAction({ kind: "role", user, role: nextRole });
                  }
                }}
              >
                {ROLE_VALUES.map((role) => (
                  <NativeSelectOption key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            );
          }
          return (
            <span className="text-sm">
              {ROLE_LABELS[user.role]}
              {isSuperAdmin ? " · protected" : ""}
            </span>
          );
        },
        meta: { headerTitle: "Role" },
      },
      {
        accessorKey: "active",
        header: ({ column }) => <DataGridColumnHeader title="Status" column={column} />,
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "success-light" : "outline"}>
            {row.original.active ? "Active" : "Deactivated"}
          </Badge>
        ),
        meta: { headerTitle: "Status" },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUserId;
          const isSuperAdmin = user.role === "SUPER_ADMIN";
          if (!canManage || !user.active || isSelf || isSuperAdmin) return null;
          return (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyUserId === user.id}
                onClick={() => setPendingUserAction({ kind: "deactivate", user })}
              >
                {busyUserId === user.id ? (
                  <Spinner />
                ) : (
                  <UserMinusIcon aria-hidden="true" />
                )}
                Deactivate
              </Button>
            </div>
          );
        },
      },
    ],
    [busyUserId, canManage, currentUserId],
  );

  const table = useTable({
    features: dataGridFeatures,
    data: users,
    columns,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });

  const addDialog = canManage ? (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            onClick={() => {
              setForm(EMPTY_FORM);
              setError(null);
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add member
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>Set up their profile and sign-in access.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onCreate} className="flex flex-col gap-4" noValidate>
          <FormAlert error={error} />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                <UserRoundIcon className="size-3.5" aria-hidden="true" />
                Personal details
              </h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-name">Full name</Label>
                <Input
                  id="user-name"
                  required
                  autoComplete="name"
                  value={form.displayName}
                  onChange={(e) => set("displayName", e.target.value)}
                  disabled={saving}
                />
                <FieldError error={error} field="displayName" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-username">Username</Label>
                <Input
                  id="user-username"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  disabled={saving}
                />
                <FieldError error={error} field="username" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-email">Email (optional)</Label>
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={saving}
                />
                <FieldError error={error} field="email" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
                Sign-in access
              </h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-role">Role</Label>
                <NativeSelect
                  id="user-role"
                  value={form.role}
                  onChange={(e) => set("role", e.target.value as Role)}
                  disabled={saving}
                  className="w-full"
                >
                  {ROLE_VALUES.map((role) => (
                    <NativeSelectOption key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError error={error} field="role" />
              </div>
              <div className="flex flex-col gap-1.5">
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
                <FieldError error={error} field="password" />
                <p className="text-muted-foreground text-xs">
                  At least 12 characters. Ask them to change it after signing in.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-phone">Phone (optional)</Label>
                <Input
                  id="user-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  disabled={saving}
                />
                <FieldError error={error} field="contactPhone" />
              </div>
            </div>
          </div>

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
              {saving ? <Spinner /> : null}
              {saving ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {pendingUserAction ? (
        <ConfirmSheet
          open
          onOpenChange={(next) => {
            if (!next) {
              if (pendingUserAction.kind === "role") router.refresh();
              setPendingUserAction(null);
            }
          }}
          title={
            pendingUserAction.kind === "role"
              ? `Change ${pendingUserAction.user.displayName}'s role?`
              : `Deactivate ${pendingUserAction.user.displayName}?`
          }
          description={
            pendingUserAction.kind === "role"
              ? "This changes the account's access immediately."
              : "Their sessions end immediately and they will no longer be able to sign in."
          }
          details={
            pendingUserAction.kind === "role" ? (
              <p>
                {ROLE_LABELS[pendingUserAction.user.role]} → {ROLE_LABELS[pendingUserAction.role]}
              </p>
            ) : (
              <p className="font-mono text-sm">@{pendingUserAction.user.username}</p>
            )
          }
          confirmLabel={
            pendingUserAction.kind === "role" ? "Change role" : "Deactivate account"
          }
          destructive={pendingUserAction.kind === "deactivate"}
          onConfirm={confirmUserAction}
        />
      ) : null}

      {users.length === 0 ? (
        <Frame spacing="default">
          <FramePanel>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No team members yet</EmptyTitle>
                <EmptyDescription>Add staff accounts for sellers, verifiers and supervisors.</EmptyDescription>
              </EmptyHeader>
              {addDialog ? <EmptyContent>{addDialog}</EmptyContent> : null}
            </Empty>
          </FramePanel>
        </Frame>
      ) : (
        <DataGrid
          table={table}
          recordCount={users.length}
          tableLayout={{ dense: true, rowBorder: true, headerBackground: true }}
          tableClassNames={{ base: "min-w-[680px]" }}
        >
          <Frame spacing="default">
            <FrameHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <FrameTitle>Staff accounts</FrameTitle>
                  <FrameDescription>
                    {users.length} {users.length === 1 ? "member" : "members"}
                  </FrameDescription>
                </div>
                {addDialog}
              </div>
            </FrameHeader>
            <FramePanel className="p-0">
              <DataGridScrollArea orientation="horizontal">
                <DataGridTable />
              </DataGridScrollArea>
            </FramePanel>
            <FrameFooter>
              <DataGridPagination />
            </FrameFooter>
          </Frame>
        </DataGrid>
      )}
    </div>
  );
}
