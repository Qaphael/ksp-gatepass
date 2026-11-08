# Ticket v2 prompt pack

Run in order with `/tickets <n>` (opencode) or `$tickets <n>` (Codex). Use Plan mode for the first message of each prompt, review the plan, then build. After each prompt: verify, review, status, commit. Tick the prompt under "## Tickets v2" in `docs/TASKS.md` when done.

Source of truth: `docs/PRD-ADDENDUM-TICKETS.md`. Also follow `docs/business-rules.md`, `docs/DESIGN.md` for any UI, and `AGENTS.md`.

Shared rules for every prompt:
- Do not weaken or bypass any existing rule. Check-in, payment, token and permission behaviour must keep working, and all existing tests stay green.
- Plan first and wait for approval. Check current docs and versions before adding any dependency, and ask before adding one.
- Data layer and constraints first, then services, then API, then UI. Server-side permission checks on every endpoint. Idempotency keys on mutations. Audit entries for every critical action. No tokens in logs, audit records, URLs or exports.
- Real PostgreSQL integration tests for concurrency and uniqueness. No mocks for those.
- Finish with: what changed, tests run with real output, open issues, next step.

---

## Prompt T0 — Impact analysis (read-only)
```
Read docs/PRD-ADDENDUM-TICKETS.md fully, then docs/PRD.md sections 5.5 to 5.7, 7 and 9, and docs/business-rules.md. Do not change any files.

Inspect the current code: prisma/schema.prisma, sales.service.ts, tickets.service.ts, ticket-batches.service.ts, print.service.ts, src/lib/pdf/ticket.tsx, event-branding.service.ts, the permission map, the scanner component, the sales pages, and how tokens are stored and decrypted for printing.

Write docs/TICKETS-IMPACT.md covering:
1. Every file, table, endpoint and screen that must change, grouped by addendum section.
2. A migration plan: schema changes, constraints, partial unique index for custody, handling of existing tickets, sales and print batches. Nothing existing may break.
3. Which parts of event-branding.service.ts (storage, validation, serving) can be reused for template artwork.
4. The PDF approach: confirm whether @react-pdf/renderer can place the artwork image, embed fonts, draw vector QR, render rotated text and crop marks at the precision needed. If something is missing, list options with trade-offs and ask me before adding any dependency.
5. How the scanner component can be reused for the sell flow.
6. Risks, and anything in the addendum that conflicts with the existing code or PRD.
7. A recommended build order and task list per prompt T1 to T9.
Then stop and wait for me.
```

## Prompt T1 — Template model, upload and zone configuration
```
Read docs/PRD-ADDENDUM-TICKETS.md sections A3.1 to A3.6, A7, A9, A10 (rules 21 and 22), docs/TICKETS-IMPACT.md and event-branding.service.ts. Plan first.

Build (no PDF rendering yet):
1. Prisma models and migration for TicketTemplate and the PrintBatch additions. Constraints, indexes, status enum.
2. Zod schema for the template config exactly as in A3.3, plus cross-field validation: all zones inside the trim box, QR printed size and module size minimums (A3.8, computed for the chosen sheet scale), only known field keys, positive sizes.
3. Artwork upload service following A3.5: PNG/JPEG only, signature check, size and megapixel limits, aspect-ratio check with a message stating the expected pixel size, random file name, upload volume outside public/, metadata stripped. Reuse the branding storage and serving patterns. Serve through an authenticated route.
4. Versioning: edits to a used version create a new version; activation requires owner confirmation fields (confirmed-by, confirmed-at) and, for production, a recorded calibration print (the flag is set in T2).
5. Seed a DRAFT template with PLACEHOLDER zones for development, clearly marked, and a generated sample artwork for tests (no real design file is available yet).
6. Endpoints from A8 (list, create, patch, activate), permission template:manage (admin only), audit entries, idempotency keys.
7. Tests: config validation cases, upload rejections (SVG, wrong signature, oversize, wrong ratio), version immutability, permission denial for other roles, audit entries.
Do not touch sales or check-in.
Also: do not change the existing event poster/logo routes (they are public today); list in your final summary whether template artwork reuses any public route (it must not) and ask me whether public poster serving is intended. Partial unique indexes are needed in T6; note in your summary how you will enable and verify Prisma's partialIndexes preview feature and confirm migrate shows no drift.
```

## Prompt T2 — Renderer and print outputs
```
Read docs/PRD-ADDENDUM-TICKETS.md sections A3.4, A3.7 to A3.9 and docs/TICKETS-IMPACT.md sections 4 and 6. Plan first.

STEP 0 — SPIKE (do this and stop for my decision before building anything). The T0 probe showed @react-pdf/renderer 4.9.0 duplicates a repeated image per ticket. Using a throwaway script outside the repo (no dependency changes), generate a realistic test artwork (2551 x 768 px, photographic noise or gradients so it does not compress like a flat colour, aim for 1 to 3 MB) and measure, for 500 tickets in the 5-per-A4 layout: PDF size, generation time and peak memory for each method:
  a. react-pdf with the same image passed as a file path string, as a Buffer, and as a data URI (check whether any of these makes it embed once);
  b. react-pdf output post-processed to deduplicate identical image objects;
  c. composing the sheet PDF from a single embedded image using pdf-lib plus @pdf-lib/fontkit for custom fonts (install only in the throwaway folder);
  d. chunking the composite into several smaller PDFs.
Also test the data-only layer (no artwork) size and time. Report a table against the size budget in A3.7. Recommend the method, state what dependency it needs and its licence, and STOP. Do not add any dependency or write production code until I approve.

After I approve, continue with the build below. Show the exact approach for artwork embedding, fonts, rotation and QR drawing first.

Build the template renderer alongside the existing one (keep the legacy generator as a fallback when no active template exists):
1. Sheet PDF: configurable tickets per page and scale (default 5 per A4; make the scale a parameter, not a constant), cut guides, artwork embedded once and reused, fonts embedded, QR vector from the token on an optional light panel, serial, category and every enabled field in its zone, stub fields with optional 90-degree rotation. Event fields come from the Event record.
2. Single-ticket PDF: one ticket per page at 100% with bleed and optional crop marks.
3. Data-only layer PDF: transparent, only QR, serial and fields, vector QR, no artwork, no CSV of tokens.
4. Calibration sheet: artwork, zone outlines, rulers, and a test QR that is not a real ticket token. Record a calibration print (who, when, template version) so activation for production can require it.
5. Wire these into print.service.ts so PrintBatch records template id, version, sheet-layout snapshot and output kind. Reprints use the batch's recorded version and never change a token.
6. Enforce the printed QR minimums at render time as well as at activation. Fonts: commit only licensed font files under a stable folder in the repo (for example assets/fonts), copy them explicitly in the Docker runner stage, resolve them relative to the app root, and prove they load inside the built Linux image, not just on Windows. Record in the summary which fonts are used and that each is licensed for embedding.
7. Tests: page dimensions per layout, artwork embedded once (check output size scaling), the QR decodes to the exact token from a rasterised render (ask before adding a dev dependency to rasterise or decode), data layer has no artwork, calibration token is not a real token, reprint reproduces identical placement, legacy fallback still works.
Do not change token generation or ticket identity.
```

## Prompt T3 — Template admin UI
```
Read docs/DESIGN.md, docs/PRD-ADDENDUM-TICKETS.md sections A3.2, A3.3, A3.8, A11 and docs/TICKET-ZONES-MEASUREMENT.md. Plan first.

Build the admin template screens, mobile first (usable on a phone for review, comfortable on desktop for editing):
1. Template list with versions, status chips and the calibration and activation state.
2. Upload flow with clear errors, including the expected pixel size.
3. Zone editor: numeric fields in millimetres for the QR, bottom strip, stub and perforation, per-field toggles and styling, with a live preview that overlays zone outlines and sample data on the artwork at true proportions. Show the computed printed QR size and module size and block activation when below the minimum.
4. Measurement import: paste the values from the measurement sheet (JSON) to fill the form.
5. Buttons for preview PDF, calibration PDF and each print output, with a confirmation that explains sheet layouts A, B and C.
6. Activation dialog that requires confirming measured values and shows whether a calibration print is recorded.
7. Loading, empty, error and success states. Follow the design tokens and patterns. No logic changes beyond what T1 and T2 exposed.
```

## Prompt T4 — Scan-to-sell backend
```
Read docs/PRD-ADDENDUM-TICKETS.md sections A4, A5, A7 to A10 and the current sales.service.ts, check-in.service.ts and idempotency handling. Plan first.

Build:
1. Migration: Event policy flags, Sale customerPhoneNormalized, SaleTicket entryMethod and scannedAt, ScanAttempt purpose.
2. Ugandan-aware phone normalisation (E.164) with unit tests for 07xx, +2567xx, 2567xx and junk.
3. POST /sales/lookup-ticket: read-only, by token or serial, returns the sellability state from A4.2 with the minimum data needed. Rate-limited, records a scan attempt with purpose SALE, never logs the token.
4. Extend POST /sales: accepts tickets by token (server hashes and finds the ticket), manual serial entries flagged MANUAL (permission or policy only), and keeps the quantity path as an admin-only bulk path. Reject client-supplied ticket ids. Keep every existing guarantee: event row lock, ticket row locks, unique SaleTicket.ticketId, idempotency with request hash, server-side pricing, atomic payment recording, audit.
5. Enforce requireBuyerDetails and buyer notice text. Add the event flag requireFullPaymentAtSale (default true): when on, a seller-created sale must be paid in full at confirmation; admin may record a partial payment; admission keeps following the event's payment policy. Buyer details never returned to verifier roles; supervisor/admin reveal at the gate only on duplicate or lookup, audited.
6. Permission changes from A9.
7. Tests: each sellability state, lookup never mutates, sale sells exactly the scanned ticket, client ids ignored or rejected, two sellers selling one ticket concurrently gives exactly one sale and one 409, manual sale gating, bulk path admin only, policy flags, phone required and normalised, idempotent retry, existing sales and check-in tests unchanged.
Stock issuing is not part of this prompt. Leave requireStockIssue unenforced until T6, but add the check as a clearly marked seam.
```

## Prompt T5 — Scan-to-sell UI
```
Read docs/DESIGN.md sections 3 to 6 and docs/PRD-ADDENDUM-TICKETS.md A4 and A11. Plan first. Reuse the existing scanner component and its offline heartbeat.

Build the seller Sell screen, mobile first and one-handed:
1. Full-width camera with torch support, debounce, and permission-denied help.
2. Cart of scanned tickets with serial, category, price and a state chip. The same ticket cannot be added twice. Remove button per ticket.
3. Each lookup result uses a distinct message and icon for every state in A4.2. Failures never use success styling.
4. Buyer name and phone fields (tel input, +256 hint, normalise on blur, plain errors), buyer notice text when configured, payment method and amount, sticky total and Confirm button.
5. Manual serial entry in a bottom sheet, available only when allowed, clearly flagged.
6. Success screen with receipt link, serials, and "Scan next". Keep the same Idempotency-Key across retries exactly as the code does today.
7. Seller landing page for the Sell tab. Offline state blocks selling with a clear banner.
8. Component tests for the state-to-style mapping and the cart rules.
```

## Prompt T6 — Seller stock backend
```
Read docs/PRD-ADDENDUM-TICKETS.md sections A6, A7 (custody, issue, remittance), A9 and A10 (rules 18, 19, 24, 25). Plan first.

Build:
1. Migration: TicketCustody with a partial unique index (one active holder per ticket), StockIssue, Remittance with a non-negative amount check and reversal link.
2. Services and endpoints: issue by range, by scan list, or by category and quantity from unissued AVAILABLE tickets; return unsold; mark lost (uses existing revoke rules and audit); seller statement; close-out rules; record and reverse remittances. Idempotency keys, row locks, audit entries.
3. Enforce requireStockIssue inside sale-by-token: a seller can sell only tickets they hold; admin and supervisor can sell any available ticket with an audit note. Selling a ticket releases its custody with reason SOLD in the same transaction.
4. Issue slip data (serials, seller, issuer, time, slip reference) for the PDF in T7.
5. Statement math: issued, sold, returned, lost, outstanding serials; takings by method from payments recorded on the seller's sales; remitted; balance owed. All integer UGX.
6. Tests: concurrent issue of the same ticket gives one success, seller cannot sell another seller's ticket, admin can with audit, sale releases custody atomically, return and loss rules, close-out blocked while serials are unaccounted for, remittance append-only with reversal, statement numbers reconcile with sales and payments.
```

## Prompt T7 — Stock and seller UI, slips and reports
```
Read docs/DESIGN.md, docs/PRD-ADDENDUM-TICKETS.md A6, A11, A12. Plan first.

Build, mobile first:
1. Seller: My stock (issued, sold, left, takings, balance owed, list of held tickets).
2. Admin: Issue stock (choose seller, choose tickets by range, scan or category and quantity), issue slip PDF with signature lines.
3. Admin: Returns and losses (scan or select), outstanding serials, seller close-out with the blocking message when serials are unaccounted for.
4. Admin: Remittances (record, reverse, balance per seller).
5. Reports from A12: seller reconciliation, stock position by serial, unsold tickets by holder, sales by entry method, template and calibration history. CSV and PDF with role scoping and formula-injection-safe CSV.
6. Gate result view for supervisors: buyer name and phone reveal on duplicate with an audit note. Verifier screens must show no buyer data.
7. Responsive lists, filters in bottom sheets, loading/empty/error states per the design spec.
```

## Prompt T8 — Permissions, audit and privacy sweep
```
Read docs/PRD-ADDENDUM-TICKETS.md A9, A10, A12, A13 and run a full sweep. Plan first, do not change behaviour beyond fixes.

1. Verify every new endpoint checks permissions server-side and denies by default, including direct calls without the UI.
2. Verify audit entries exist for everything in A12 and contain no tokens, phones in full, or file contents.
3. Verify tokens never appear in logs, URLs, exports, audit records or error messages in the new code.
4. Verify buyer details never reach verifier roles through any endpoint, page or export.
5. Update docs/business-rules.md with rules 16 to 26 (short form), AGENTS.md rules and status, and docs/TASKS.md.
6. Run the full test suite, typecheck, lint and build. Use the review command on the whole change and fix Blocking items.
Report findings as Blocking, Should fix, Nice to have.
```

## Prompt T9 — Real-world tests and release gate additions
```
Read docs/PRD-ADDENDUM-TICKETS.md A14 and docs/LAUNCH-CHECKLIST.md. Plan first.

1. Add the new items to the release gate in docs/TASKS.md and docs/LAUNCH-CHECKLIST.md: calibration print scanned on two Android phones, production sample scanned from paper, two sellers racing for one ticket on real phones, seller issue, sale, return and close-out walk-through, buyer detail privacy check at the gate, template activation with measured values.
2. Write a one-page seller guide (how to scan, what each message means, what to do when a QR will not scan, cash handover) and a one-page stock keeper guide (issue, return, loss, close-out, remittance).
3. Add a seed script for a realistic rehearsal: 3 sellers, 100 issued tickets, a mix of sold, returned and lost, some remittances. Dev only, clearly separated from production data.
4. Produce a rehearsal script I can follow the day before the event.
Do not mark items as done; I will tick them after testing on real devices.
```
