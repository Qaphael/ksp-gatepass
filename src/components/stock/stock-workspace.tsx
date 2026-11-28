"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  DownloadIcon,
  PackageIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/reui/number-field";
import { QrCamera } from "@/components/scanner/qr-camera";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { formatUGX } from "@/components/ui/money";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { compressSerialRanges, parseSerialRange } from "@/lib/serial";

type EventOption = { id: string; name: string };
type Seller = { id: string; displayName: string };
type TicketTypeOption = { id: string; name: string };

type Statement = {
  event: { id: string; name: string };
  seller: { id: string; displayName: string };
  stock: {
    issued: number;
    sold: number;
    returned: number;
    lost: number;
    outstanding: number;
    outstandingSerials: string[];
  };
  takingsByMethodUgx: Record<string, number>;
  totalTakingsUgx: number;
  remittedUgx: number;
  balanceOwedUgx: number;
  closedAt: string | null;
  batches: Array<{
    batchRef: string | null;
    ticketTypeName: string;
    unitPriceUgx: number;
    issued: number;
    sold: number;
    held: number;
    heldSerials: string[];
  }>;
  remittances: Array<{
    id: string;
    amountUgx: number;
    method: string;
    recordedAt: string;
    reversesId: string | null;
    receivedByName: string;
    reversed: boolean;
  }>;
};

type Remit = {
  id: string;
  sellerId: string;
  amountUgx: number;
  method: string;
  note: string | null;
  recordedAt: string;
  reversesId: string | null;
  seller: { displayName: string };
  reversal?: { id: string } | null;
};

const createKey = () => crypto.randomUUID();

async function send(url: string, body: unknown, idempotencyKey: string, method = "POST") {
  const r = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? "Request failed. Try again.");
  return d;
}

export function StockWorkspace({
  eventId,
  events,
  sellers,
  staff,
  ticketTypes,
  ownSellerId,
  canManage,
  canRemit,
  initialStatement,
  remittances = [],
}: {
  eventId: string;
  events: EventOption[];
  sellers: Seller[];
  staff: Seller[];
  ticketTypes: TicketTypeOption[];
  ownSellerId?: string;
  canManage: boolean;
  canRemit: boolean;
  initialStatement?: Statement | null;
  remittances?: Remit[];
}) {
  const router = useRouter();
  const keys = useRef(new Map<string, { signature: string; key: string }>());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [slipUrl, setSlipUrl] = useState("");
  const [sellerId, setSellerId] = useState(ownSellerId ?? sellers[0]?.id ?? "");
  const [selection, setSelection] = useState("TOKENS");
  const [serials, setSerials] = useState("");
  const [tokens, setTokens] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [receiver, setReceiver] = useState(staff[0]?.id ?? "");
  const [reversalReasons, setReversalReasons] = useState<Record<string, string>>({});

  const keyFor = (path: string, body: unknown) => {
    const signature = JSON.stringify(body);
    const current = keys.current.get(path);
    if (current?.signature === signature) return current.key;
    const next = { signature, key: createKey() };
    keys.current.set(path, next);
    return next.key;
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const post = async (path: string, body: unknown) => {
    await send(path, body, keyFor(path, body));
    keys.current.delete(path);
    setMessage("Saved successfully.");
  };

  const confirmPost = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await send(path, body, keyFor(path, body));
      keys.current.delete(path);
      setMessage("Saved successfully.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const issue = () =>
    act(async () => {
      const selectionPayload =
        selection === "TOKENS"
          ? { kind: "TOKENS", tokens }
          : selection === "RANGE"
            ? { kind: "RANGE", serialFrom: from, serialTo: to }
            : selection === "CATEGORY_QUANTITY"
              ? { kind: "CATEGORY_QUANTITY", ticketTypeId: typeId, quantity }
              : {
                  kind: "SERIALS",
                  serials: serials
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                };
      const body = { eventId, sellerId, selection: selectionPayload };
      const d = await send("/api/v1/stock/issues", body, keyFor("/api/v1/stock/issues", body));
      keys.current.delete("/api/v1/stock/issues");
      setMessage(`Issued ${d.issue.quantity} tickets (${d.issue.slipReference}).`);
      setSlipUrl(`/api/v1/stock/issues/${encodeURIComponent(d.issue.id)}/slip.pdf`);
      setTokens([]);
    });

  const selectedStatement = initialStatement;
  const issueSerials = serials
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const serialRange = selection === "RANGE" ? parseSerialRange(from, to) : null;
  const rangeCount = serialRange ? serialRange.to - serialRange.from + 1 : 0;
  const rangeMissing = selection === "RANGE" && (!from.trim() || !to.trim());
  const rangeInvalid = selection === "RANGE" && !rangeMissing && !serialRange;

  const statementSection = selectedStatement ? (
    <div className="flex flex-col gap-6">
      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>Stock summary</FrameTitle>
          <FrameDescription>
            {selectedStatement.seller.displayName} · {selectedStatement.event.name}
          </FrameDescription>
        </FrameHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FramePanel className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">Allocated</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {selectedStatement.stock.issued}
            </span>
          </FramePanel>
          <FramePanel className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">Sold</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {selectedStatement.stock.sold}
            </span>
          </FramePanel>
          <FramePanel className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">In hand</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {selectedStatement.stock.outstanding}
            </span>
          </FramePanel>
          <FramePanel className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium">Unremitted</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatUGX(selectedStatement.balanceOwedUgx)}
            </span>
          </FramePanel>
        </div>
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame spacing="default" stacked>
          <FrameHeader>
            <FrameTitle>Takings by method</FrameTitle>
            <FrameDescription>
              Takings: {formatUGX(selectedStatement.totalTakingsUgx)} · Remitted:{" "}
              {formatUGX(selectedStatement.remittedUgx)}
            </FrameDescription>
          </FrameHeader>
          {Object.entries(selectedStatement.takingsByMethodUgx).filter(([, v]) => v > 0).length >
          0 ? (
            Object.entries(selectedStatement.takingsByMethodUgx)
              .filter(([, v]) => v > 0)
              .map(([m, amt]) => (
                <FramePanel key={m} className="flex items-center justify-between gap-3">
                  <span className="text-sm capitalize">{m.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatUGX(amt)}
                  </span>
                </FramePanel>
              ))
          ) : (
            <FramePanel>
              <p className="text-muted-foreground text-sm">No recorded takings yet.</p>
            </FramePanel>
          )}
        </Frame>

        <Frame spacing="default" stacked>
          <FrameHeader>
            <FrameTitle>Remittance trail</FrameTitle>
            <FrameDescription>Handovers recorded for this seller</FrameDescription>
          </FrameHeader>
          {selectedStatement.remittances.length > 0 ? (
            selectedStatement.remittances.map((r) => (
              <FramePanel key={r.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{r.receivedByName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {r.method} ·{" "}
                    {new Date(r.recordedAt).toLocaleString("en-UG", {
                      timeZone: "Africa/Kampala",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatUGX(r.amountUgx)}
                  </span>
                  {r.reversed ? <Badge variant="warning-light">Reversed</Badge> : null}
                </div>
              </FramePanel>
            ))
          ) : (
            <FramePanel>
              <p className="text-muted-foreground text-sm">No remittances recorded yet.</p>
            </FramePanel>
          )}
        </Frame>
      </div>

      {selectedStatement.batches.length > 0 ? (
        <Frame spacing="default" stacked>
          <FrameHeader>
            <FrameTitle>Issued batches</FrameTitle>
            <FrameDescription>Cleared progress and held serial ranges</FrameDescription>
          </FrameHeader>
          {selectedStatement.batches.map((batch, index) => {
            const cleared = batch.issued ? Math.round((batch.sold / batch.issued) * 100) : 0;
            return (
              <FramePanel
                key={`${batch.batchRef}-${batch.ticketTypeName}-${index}`}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {batch.batchRef ?? "Batch"}
                  </span>
                  <Badge variant="outline">{batch.ticketTypeName}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Issued</p>
                    <p className="text-lg font-semibold tabular-nums">{batch.issued}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Sold</p>
                    <p className="text-lg font-semibold tabular-nums">{batch.sold}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Held</p>
                    <p className="text-lg font-semibold tabular-nums">{batch.held}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Unit price</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatUGX(batch.unitPriceUgx)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">Cleared: {cleared}%</span>
                  <div
                    className="bg-muted h-2 w-full overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={cleared}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="bg-primary h-full" style={{ width: `${cleared}%` }} />
                  </div>
                </div>
                {batch.heldSerials.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {compressSerialRanges(batch.heldSerials).map((range, rindex) => (
                      <Badge key={`${range}-${rindex}`} variant="outline" className="font-mono">
                        {range}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </FramePanel>
            );
          })}
        </Frame>
      ) : null}

      <Frame spacing="default">
        <FrameHeader>
          <FrameTitle>Tickets still held</FrameTitle>
          <FrameDescription>Unsold serials currently assigned to this seller</FrameDescription>
        </FrameHeader>
        <FramePanel>
          {selectedStatement.stock.outstandingSerials.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedStatement.stock.outstandingSerials.map((s) => (
                <Badge key={s} variant="outline" className="font-mono">
                  {s}
                </Badge>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No tickets held</EmptyTitle>
                <EmptyDescription>All issued tickets have been sold or returned.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </FramePanel>
      </Frame>
    </div>
  ) : null;

  const issueSection = (
    <Frame spacing="default">
      <FrameHeader>
        <FrameTitle>Issue stock</FrameTitle>
        <FrameDescription>Assign unsold tickets to a seller.</FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-seller">Seller</Label>
            <NativeSelect
              id="issue-seller"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full"
            >
              {sellers.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-method">Choose tickets by</Label>
            <NativeSelect
              id="issue-method"
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              className="w-full"
            >
              <NativeSelectOption value="TOKENS">Scan ticket QR codes</NativeSelectOption>
              <NativeSelectOption value="SERIALS">Enter serials</NativeSelectOption>
              <NativeSelectOption value="RANGE">Serial range</NativeSelectOption>
              <NativeSelectOption value="CATEGORY_QUANTITY">
                Category and quantity
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        {selection === "TOKENS" ? (
          <div className="flex flex-col gap-3">
            <QrCamera
              disabled={busy}
              paused={busy}
              onScan={(value) => {
                if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
                  setError("That QR is not a recognised ticket code.");
                  return;
                }
                setError("");
                setTokens((current) => (current.includes(value) ? current : [...current, value]));
              }}
              label="Scan ticket QR to issue stock"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">
                Scanned tickets: <strong>{tokens.length}</strong>
              </span>
              {tokens.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setTokens([])}>
                  Clear list
                </Button>
              ) : null}
            </div>
          </div>
        ) : selection === "SERIALS" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-serials">Enter serials (one per line)</Label>
            <Textarea
              id="issue-serials"
              rows={4}
              className="font-mono"
              value={serials}
              onChange={(e) => setSerials(e.target.value)}
              placeholder="KSP-0001"
            />
          </div>
        ) : selection === "RANGE" ? (
          <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="range-from">From serial</Label>
                <Input
                  id="range-from"
                  className="font-mono"
                  value={from}
                  onChange={(e) => setFrom(e.target.value.toUpperCase())}
                  placeholder="KSP-00001"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="range-to">To serial</Label>
                <Input
                  id="range-to"
                  className="font-mono"
                  value={to}
                  onChange={(e) => setTo(e.target.value.toUpperCase())}
                  placeholder="KSP-00500"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {rangeMissing
                ? "Enter both serials, for example KSP-00001 and KSP-00500."
                : rangeInvalid
                  ? "Use one prefix, with the start serial before the end serial."
                  : `Will issue ${rangeCount} ticket${rangeCount === 1 ? "" : "s"}.`}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-category">Ticket category</Label>
              <NativeSelect
                id="issue-category"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="">Choose a category</NativeSelectOption>
                {ticketTypes.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-qty">Quantity</Label>
              <NumberField
                min={1}
                max={500}
                value={quantity}
                onValueChange={(v) => setQuantity(v ?? 1)}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement aria-label="Decrease quantity" />
                  <NumberFieldInput id="issue-qty" />
                  <NumberFieldIncrement aria-label="Increase quantity" />
                </NumberFieldGroup>
              </NumberField>
            </div>
          </div>
        )}
      </FramePanel>
      <FrameFooter>
        <Button
          type="button"
          disabled={
            busy ||
            !sellerId ||
            (selection === "TOKENS" && !tokens.length) ||
            (selection === "RANGE" && !serialRange)
          }
          onClick={issue}
        >
          {busy ? "Issuing…" : "Issue tickets and print slip"}
        </Button>
      </FrameFooter>
    </Frame>
  );

  const returnsSection = (
    <Frame spacing="default">
      <FrameHeader>
        <FrameTitle>Returns and losses</FrameTitle>
        <FrameDescription>
          Close-out is blocked while any issued ticket remains unaccounted for.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-seller">Seller</Label>
          <NativeSelect
            id="return-seller"
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="w-full"
          >
            {sellers.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-serials">Serials to return or mark lost</Label>
          <Textarea
            id="return-serials"
            rows={3}
            className="font-mono"
            value={serials}
            onChange={(e) => setSerials(e.target.value)}
            placeholder="KSP-00001, KSP-00002"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !issueSerials.length}
            onClick={() =>
              act(() =>
                post("/api/v1/stock/returns", { eventId, sellerId, serials: issueSerials }),
              )
            }
          >
            Return unsold
          </Button>
          <ConfirmSheet
            trigger={
              <Button type="button" variant="outline" disabled={busy || !issueSerials.length}>
                Mark lost
              </Button>
            }
            title="Mark tickets lost?"
            description="The listed tickets will be revoked and cannot be admitted. The loss will be recorded in ticket history."
            details={
              <div>
                <p className="font-semibold">
                  {issueSerials.length} ticket{issueSerials.length === 1 ? "" : "s"} ·{" "}
                  {sellers.find((s) => s.id === sellerId)?.displayName ?? "Seller"}
                </p>
                <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto">
                  {issueSerials.map((serial) => (
                    <li key={serial} className="break-all font-mono">
                      {serial}
                    </li>
                  ))}
                </ul>
              </div>
            }
            reasonLabel="Reason for loss (required)"
            confirmLabel="Mark lost and revoke"
            destructive
            onConfirm={async (lossReason) => {
              await confirmPost("/api/v1/stock/losses", {
                eventId,
                sellerId,
                serials: issueSerials,
                reason: lossReason,
              });
            }}
          />
          <ConfirmSheet
            trigger={
              <Button type="button" variant="outline" disabled={busy}>
                Close seller out
              </Button>
            }
            title="Close out seller?"
            description="Confirm the end-of-event stock reconciliation for this seller."
            details={
              <p className="font-semibold">
                {sellers.find((s) => s.id === sellerId)?.displayName ?? "This seller"} ·{" "}
                {selectedStatement?.event.name ?? events.find((e) => e.id === eventId)?.name}
              </p>
            }
            confirmLabel="Close seller out"
            destructive
            onConfirm={async () => {
              await confirmPost(
                `/api/v1/stock/sellers/${encodeURIComponent(sellerId)}/close-out`,
                { eventId },
              );
            }}
          />
        </div>
      </FramePanel>
    </Frame>
  );

  const remittancesSection = (
    <div className="flex flex-col gap-6">
      {canRemit ? (
        <Frame spacing="default">
          <FrameHeader>
            <FrameTitle>Record remittance</FrameTitle>
            <FrameDescription>Log cash or transfer handed over by a seller.</FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remit-seller">Seller</Label>
              <NativeSelect
                id="remit-seller"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="w-full"
              >
                {sellers.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.displayName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="remit-amount">Amount</Label>
                {selectedStatement ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => setAmount(String(selectedStatement.balanceOwedUgx))}
                  >
                    Fill balance
                  </Button>
                ) : null}
              </div>
              <InputGroup>
                <InputGroupAddon>UGX</InputGroupAddon>
                <InputGroupInput
                  id="remit-amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                />
              </InputGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="remit-method">Method</Label>
                <NativeSelect
                  id="remit-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full"
                >
                  {["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "OTHER"].map((x) => (
                    <NativeSelectOption key={x} value={x}>
                      {x.replaceAll("_", " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="remit-receiver">Received by</Label>
                <NativeSelect
                  id="remit-receiver"
                  value={receiver}
                  onChange={(e) => setReceiver(e.target.value)}
                  className="w-full"
                >
                  {staff.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {s.displayName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </FramePanel>
          <FrameFooter>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                act(() =>
                  post("/api/v1/remittances", {
                    eventId,
                    sellerId,
                    amountUgx: Number(amount),
                    method,
                    receivedById: receiver,
                  }),
                )
              }
            >
              Record handover
            </Button>
          </FrameFooter>
        </Frame>
      ) : null}

      {remittances.length > 0 ? (
        <Frame spacing="default" stacked>
          <FrameHeader>
            <FrameTitle>Remittances</FrameTitle>
            <FrameDescription>Recorded handovers and reversals</FrameDescription>
          </FrameHeader>
          {remittances.map((r) => (
            <FramePanel key={r.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {r.seller.displayName} · {formatUGX(r.amountUgx)}
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  {r.method} ·{" "}
                  {new Date(r.recordedAt).toLocaleString("en-UG", {
                    timeZone: "Africa/Kampala",
                  })}
                  {r.reversesId ? " · Reversed" : ""}
                </span>
              </div>
              {!r.reversesId && !r.reversal ? (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Reversal reason"
                    placeholder="Reason"
                    className="max-w-44"
                    value={reversalReasons[r.id] ?? ""}
                    onChange={(e) =>
                      setReversalReasons((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        post(`/api/v1/remittances/${r.id}/reverse`, {
                          reason: reversalReasons[r.id] ?? "",
                        }),
                      )
                    }
                  >
                    Reverse
                  </Button>
                </div>
              ) : null}
            </FramePanel>
          ))}
        </Frame>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {events.length > 1 ? (
        <Frame spacing="default">
          <FramePanel>
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="stock-event">Event</Label>
              <NativeSelect
                id="stock-event"
                value={eventId}
                onChange={(e) =>
                  router.push(`/stock?eventId=${encodeURIComponent(e.target.value)}`)
                }
                className="w-full"
              >
                {events.map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert variant="success" role="status">
          <CheckCircle2Icon aria-hidden="true" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {slipUrl ? (
        <Button
          nativeButton={false}
          variant="outline"
          className="w-fit"
          render={<a href={slipUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <DownloadIcon aria-hidden="true" />
          Download issue slip PDF
        </Button>
      ) : null}

      {canManage && !ownSellerId ? (
        <Tabs defaultValue={selectedStatement ? "statement" : "issue"} className="flex flex-col gap-4">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
            {selectedStatement ? <TabsTrigger value="statement">Statement</TabsTrigger> : null}
            <TabsTrigger value="issue">Issue stock</TabsTrigger>
            <TabsTrigger value="returns">Returns &amp; losses</TabsTrigger>
            {canRemit || remittances.length > 0 ? (
              <TabsTrigger value="remittances">Remittances</TabsTrigger>
            ) : null}
          </TabsList>
          {selectedStatement ? <TabsContent value="statement">{statementSection}</TabsContent> : null}
          <TabsContent value="issue">{issueSection}</TabsContent>
          <TabsContent value="returns">{returnsSection}</TabsContent>
          {canRemit || remittances.length > 0 ? (
            <TabsContent value="remittances">{remittancesSection}</TabsContent>
          ) : null}
        </Tabs>
      ) : (
        statementSection
      )}

      <Alert variant="warning">
        <ClockIcon aria-hidden="true" />
        <AlertTitle>End of shift reconciliation notice</AlertTitle>
        <AlertDescription>
          Physical stock &amp; cash reconciliation required before gate close at 23:00 EAT.
        </AlertDescription>
      </Alert>
    </div>
  );
}
