# Business rules (always in context)

Short version of PRD section 7 and 9. Full detail is in `docs/PRD.md`.

## Entities and states

- Ticket inventory: `AVAILABLE`, `RESERVED` (only if reservations are enabled), `SOLD`, `CANCELLED`, `REVOKED`.
- Sale: `DRAFT`, `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`, `REFUNDED`.
- Payment: `RECORDED`, `REVERSED`, `REFUNDED`.
- Admission: derived from a `CheckIn` record (`NOT_CHECKED_IN` or `CHECKED_IN`). Failed scans go in `ScanAttempt`, never change admission state.

## Rules

1. A ticket belongs to exactly one event and one ticket type.
2. Serial is unique. QR token hash is unique. A ticket has at most one successful check-in.
3. A ticket cannot be admitted if revoked, cancelled, outside its validity window, in an ineligible sale (default: sale not fully paid), for another event, or already checked in.
4. Capacity (event and per category) can never be exceeded, including by concurrent sales or batch generation.
5. Sale totals come from stored prices, quantities and permitted discounts, never from the browser.
6. Payments are append-only. Corrections use linked reversal or refund records. Overpayment is blocked by default.
7. Check-ins and payments are never hard-deleted through the app.
8. Reprinting never creates a new ticket or token, and never revalidates a revoked ticket.
9. QR and serial verification converge on the same server eligibility and check-in logic.
10. Admission and payment policy apply identically to every verification method.
11. Overrides need explicit permission, a reason and an audit record.
12. All critical operations are idempotent and safe to retry.
13. Every event-specific query checks the actor's access to that event.
14. Already checked-in tickets cannot go through normal cancellation. Use the audited incident-resolution flow, and keep the original check-in in history.
15. Draft sales do not consume permanent inventory. Tickets are allocated atomically at sale confirmation.

## Roles (least privilege)

- Admin: everything.
- Seller: create sales, record permitted payments, print or reprint authorised tickets, own sales only.
- Verifier: scan, serial lookup, confirm check-in. No sales, payments, or duplicate override.
- Supervisor: monitoring, failed scans, summaries. Exceptions only if explicitly granted and audited.

## Check-in results (must be distinct and never green on failure)

Valid and admitted · invalid or unknown QR · other event · not fully paid · cancelled or revoked · already used (show original time and gate if permitted) · not yet valid · expired or outside window · admission closed · network unavailable · server error.

## Audit and privacy

Audit every login, sale, payment, reversal, batch, reprint, revoke, check-in, rejected scan, role change, correction and export. Never store passwords, session secrets or raw QR tokens in logs or audit records. Customer phone numbers never appear on verifier-facing results.
