# PRD Addendum 1 — Designed ticket, scan-to-sell and seller stock

Extends PRD sections 5.5 to 5.7, 6.3, 7, 9, 10 and 13. Where this addendum conflicts with the PRD for **sales and printing**, the addendum wins. Check-in rules (PRD 5.10, 5.11, 6.4 to 6.6) are unchanged. Nothing here weakens a rule in `docs/business-rules.md`.

Verified against the current code: sale creation allocates the oldest `AVAILABLE` tickets by quantity (`sales.service.ts`); first-time production printing requires an active measured template, while the original green/gold PDF renderer remains for historical reprints without a recorded template (`src/server/services/print.service.ts`, `src/lib/pdf/ticket.tsx`); an event poster/logo upload service exists (`event-branding.service.ts`).

## A1. Summary

1. **Designed ticket.** The owner's own artwork (210 x 59 mm, includes the poster design) becomes the ticket background. The system adds only what must be electronic: the QR, the serial, the category and a few configurable data fields, plus the whole stub.
2. **Scan-to-sell.** A seller scans the physical ticket they are handing over. That exact ticket is sold, and the buyer's name and phone are recorded. The system no longer chooses serials for pre-printed stock.
3. **Seller stock.** With many sellers, the system records which tickets each seller holds, who sold what, and how much cash each seller owes.

Tickets are not printed yet, so the layout, the QR position and the data model can all be settled before any paper is produced.

## A2. Decisions

| Item | Decision | Status |
| --- | --- | --- |
| Ticket size | 210 x 59 mm trim | Owner |
| Stub | Left blank in the artwork; the system draws it | Owner |
| QR position | Right side of the main section, next to the stub | Owner |
| Electronic data position | Bottom strip | Owner |
| Exact zone coordinates | Measured from the real file, stored as configuration | Pending (design file not available yet) |
| Stub contents | Serial, category, event name, date (configurable) | Default, owner to confirm |
| Bottom strip contents | Serial, category, price (toggle), footer text, authenticity notice (configurable) | Default, owner to confirm |
| Buyer name and phone | Required for every sale (event policy flag) | Owner |
| Sellers sell only tickets issued to them | On by default (event policy flag) | Default |
| Payment at sale | A seller-created sale must be paid in full at confirmation, because the physical ticket is handed over (policy flag `requireFullPaymentAtSale`, default true). Admin may record partial payments. | Default, owner to confirm |
| Manual serial sale | Admin and supervisor only; sellers need a policy flag; always flagged on the sale | Default |
| Sheet layout | Configurable; see A3.9 | Default |

## A3. Ticket template and printing

### A3.1 Assumed layout (left to right)

`artwork | QR zone | stub`, with a **bottom strip** across the main section for electronic data. The perforation sits between the QR zone and the stub. All of this is an assumption from the owner's description and is replaced by measured values (A3.2).

### A3.2 Coordinates and measurement

- Origin is the top-left corner of the **trim box** (the finished 210 x 59 mm ticket, bleed excluded). Bleed extends outward. Units are millimetres.
- Every zone is stored in the template configuration, never hard-coded. Seed values are placeholders marked `PLACEHOLDER`, and the template cannot be activated for production until the owner confirms measured values.
- The owner fills in `docs/TICKET-ZONES-MEASUREMENT.md` from the real file.

### A3.3 Template configuration (JSON, validated with Zod)

```
{
  "schemaVersion": 1,
  "trim": { "widthMm": 210, "heightMm": 59 },
  "bleedMm": 3,
  "perforationXMm": number | null,
  "qr": {
    "xMm": number, "yMm": number, "sizeMm": number,
    "errorCorrection": "M",
    "panel": { "enabled": true, "color": "#FFFFFF", "paddingMm": 2, "radiusMm": 1.5 }
  },
  "bottomStrip": { "xMm": number, "yMm": number, "widthMm": number, "heightMm": number, "fields": [Field] },
  "stub": { "xMm": number, "yMm": number, "widthMm": number, "heightMm": number, "rotation": 0 | 90 | 270, "fields": [Field] },
  "fonts": { "primary": FontRef, "mono": FontRef }
}
Field = {
  "key": "serial" | "category" | "price" | "eventName" | "eventDate" | "eventTime" | "venue" | "footerText" | "organiserContact" | "authNotice",
  "xMm": number, "yMm": number, "maxWidthMm": number,
  "font": "primary" | "mono", "sizePt": number, "weight": "regular" | "bold",
  "color": "#RRGGBB", "align": "left" | "center" | "right",
  "uppercase": boolean, "letterSpacingPt": number, "enabled": boolean
}
```

Field positions are relative to their zone's top-left. Event data (name, date, time, venue, footer text, contact) always comes from the Event record, so a corrected date reaches the next print, never a stale copy.

### A3.4 What the system draws

- **QR:** vector, generated from the secure token (never the serial), error correction M, drawn on a solid light panel when enabled. No logo or artwork inside the QR.
- **Serial:** monospace, large, in the bottom strip and repeated on the stub.
- **Category:** from the ticket type's print label or name.
- **Stub:** its configured fields, with optional 90-degree rotation.
- **Not drawn:** buyer name or phone (tickets are pre-printed; buyer data stays in the system).

### A3.5 Artwork upload rules

- PNG or JPEG only, RGB. Maximum 40 MB and 40 megapixels. No SVG, no PDF in this release.
- Validate by file signature, not extension or client MIME type. Strip metadata except what is needed for colour. Random server-side file name. Store on the existing upload volume outside `public/`. Reuse the storage and validation patterns of `event-branding.service.ts`; limits differ.
- The image aspect ratio must match trim plus bleed within 1%. Otherwise reject with a clear message that states the expected pixel size at 300 dpi (about 2551 x 768 px for 216 x 65 mm).
- Admin only. Audited (upload, replace, activate, retire). No file contents in audit logs.
- The artwork is not secret. Generated PDFs containing QR tokens remain sensitive (existing rule).

### A3.6 Versioning

A template version is immutable once any production print used it. Editing zones or artwork creates a new version. A `PrintBatch` records the template id and version and a snapshot of the sheet layout, so a reprint always reproduces the same ticket.

### A3.7 Outputs

1. **Sheet PDF:** artwork + data, multiple tickets per page (default 5 per A4, see A3.9), cut guides.
2. **Single-ticket PDF:** one ticket per page at 100% with bleed and optional crop marks, for print shops.
3. **Data-only layer:** transparent PDF with only the QR, serial and fields in position, for a shop that merges data onto the artwork. It contains vector QR codes and never a CSV of tokens.
4. **Calibration sheet:** artwork, zone outlines, rulers, and a test QR (a token that is not a real ticket) for checking alignment and scanning on real paper.
5. The artwork is embedded once per PDF and reused, not once per ticket. Fonts are embedded. QR stays vector. **Known risk:** the T0 probe showed `@react-pdf/renderer` 4.9.0 duplicates a repeated image (5 tickets gave 5 image objects, 100 gave 100). A real artwork can be megabytes, so a naive 500-ticket composite could be hundreds of megabytes. Size budget: a 500-ticket composite PDF must stay within about the artwork file size times 5 plus 5 MB, or be split into chunks. The method is decided by the T2 spike before the renderer is built.

### A3.8 Print rules (additions to PRD 5.6)

- The printed QR module size (QR size x sheet scale / (modules + 8)) must be at least 0.5 mm. Below that, block activation and tell the owner.
- The printed QR size after scaling must be at least 20 mm.
- The operator must print and scan a calibration sheet from paper before the production batch. The system records that a calibration print happened.
- Reprinting never changes a token and uses the batch's recorded template version.

### A3.9 Sheet layout and printer margins

Five tickets of 59 mm stack to 295 mm on a 297 mm A4 page, and 210 mm is the full page width. Office printers cannot print to the paper edge, so artwork at 100% on A4 would be clipped. Options, configurable per print job:

- **A: A4, 5 per page, scaled** (default; the existing code uses 94%). Printed ticket becomes about 197 x 55 mm. The zone coordinates scale with it.
- **B: Print shop, 100%.** Single-ticket PDF with bleed on a larger sheet with crop marks. The shop trims and perforates.
- **C: Variable-data merge.** Data-only layer over the shop's own artwork.

Perforation is done by the printer or shop and must match `perforationXMm`. Tell the shop the exact position.

## A4. Scan-to-sell

### A4.1 Flow

1. Seller opens Sell and scans the ticket QR with the phone camera.
2. `lookup-ticket` (read-only) returns serial, category, price and a **sellability state**.
3. Sellable tickets join the cart. Several tickets can be scanned. The same ticket cannot be added twice.
4. Seller enters buyer name and phone (required by policy), payment method and amount received. With `requireFullPaymentAtSale` on, the amount must cover the total.
5. Seller confirms. The server finds each ticket by **hashing the submitted token**, re-checks sellability under locks, creates the sale, records the payment and writes audit entries.
6. Success screen: receipt, serials, and "Scan next".

### A4.2 Sellability states (distinct messages)

Sellable · unknown QR · other event · already sold · issued to another seller · not issued to you · cancelled or revoked · sales closed · ticket type inactive · event not selling. A seller is never shown the other seller's identity or the buyer's details. Admins see the holder.

### A4.3 Proof of possession

The sale request carries the scanned **token**, not a client-supplied ticket id. The server derives the ticket from the token hash. A manual serial sale sends `{serial, entryMethod: "MANUAL"}`, is allowed only by permission or policy, and is flagged on `SaleTicket` and in the audit log.

### A4.4 Lookup never admits

`lookup-ticket` writes no check-in, changes no status, is rate-limited, and is recorded as a scan attempt with purpose `SALE`. A seller cannot reach the admission endpoints.

### A4.5 Admin quantity sales

The existing quantity-based sale stays as an **admin-only bulk path** (for example, selling unprinted or digital stock). Sellers use scan-to-sell only. The quantity path must warn that it picks serials and is unsuitable for pre-printed stock.

## A5. Buyer details

- `customerName` and `customerPhone` already exist on `Sale`. They become **required** when the event policy `requireBuyerDetails` is true (default true).
- Add a normalised phone (`customerPhoneNormalized`, E.164, default country Uganda +256). Accept `07xx...`, `+2567xx...`, `2567xx...`. Reject numbers that fail validation with a plain message. Store both entered and normalised forms.
- One buyer may buy several tickets in one sale. The same phone across sales is allowed.
- Phones never appear on verifier screens (existing rule). Supervisors and admins can see buyer name and phone on a gate result **only** when a check-in is rejected as a duplicate or on explicit lookup, and each such view is audited.
- Collect only name and phone. Show a short notice to the buyer text at sale time (configurable text). Data-protection obligations apply; the owner should confirm requirements with a qualified adviser.

## A6. Seller stock

### A6.1 Concepts (kept separate from inventory status)

Custody is a separate concept from inventory status, as ticket inventory, payment and admission already are. A ticket's inventory status stays `AVAILABLE / SOLD / CANCELLED / REVOKED`. Custody records who physically holds it.

### A6.2 Issue

Admin (or permitted supervisor) issues tickets to a seller by serial range, by scanning, or by category and quantity from unissued `AVAILABLE` tickets. One active holder per ticket (partial unique index on active custody). Output: an **issue slip** PDF listing serials, with signature lines for handover. Issuing is audited.

### A6.3 Return, loss, close-out

- **Return unsold:** scan or select tickets, custody ends, ticket returns to the unissued pool.
- **Lost or damaged:** mark lost, which revokes the ticket (existing revoke rules). A replacement ticket with a new serial can be issued through the audited replacement workflow.
- **Close-out:** when a seller finishes, the system lists any serial still unaccounted for. A seller can be closed only when every issued ticket is sold, returned or lost.

### A6.4 Money

- A seller's **recorded takings** are payments recorded on their sales, by method.
- A **remittance** records money handed to the organiser: seller, amount, method, receiver, time, note. Append-only. Corrections are linked reversals.
- Seller statement: issued, sold, returned, lost, outstanding serials; takings by method; remitted; **balance owed**.
- The system does not verify that cash physically exists. It records what staff say was received and handed over.

### A6.5 Policy

`requireStockIssue` (default true): a seller can sell only tickets issued to them. Admin and supervisor can sell any available ticket, with the action audited. If false, sellers can sell any available ticket they scan.

## A7. Data model changes

| Change | Detail |
| --- | --- |
| `TicketTemplate` (new) | event, optional ticket type, name, version, asset path, asset checksum, pixel size, trim, bleed, config JSON, status (DRAFT / ACTIVE / RETIRED), confirmed-by and confirmed-at, calibration-printed-at, timestamps |
| `PrintBatch` | add template id, template version, sheet-layout snapshot, output kind |
| `Event` | add `requireBuyerDetails`, `requireStockIssue`, `allowSellerManualSale`, `requireFullPaymentAtSale`, `buyerNoticeText` |
| `Sale` | add `customerPhoneNormalized`, make name and phone required by policy at service level |
| `SaleTicket` | add `entryMethod` (SCAN / MANUAL / BULK), `scannedAt` |
| `ScanAttempt` | add `purpose` (ADMISSION / SALE) |
| `TicketCustody` (new) | ticket, seller, issued-by, issued-at, released-at, release reason (SOLD / RETURNED / LOST / REASSIGNED); **partial unique index** on ticket where released-at is null |
| `StockIssue` (new) | event, seller, issued-by, issued-at, slip reference; groups custody rows |
| `Remittance` (new) | event, seller, amount UGX (integer), method, received-by, recorded-at, note, reverses-id nullable; append-only |

All new tables have database constraints, foreign keys, non-negative money checks, and indexes for seller and event lookups. Migrations run from a clean database and on top of the current schema. Existing tickets, sales and tokens are untouched.

## A8. API additions (`/api/v1`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET/POST` | `/events/:id/ticket-templates` | List, create template (multipart upload) |
| `PATCH` | `/ticket-templates/:id` | Edit config (creates a new version if used) |
| `POST` | `/ticket-templates/:id/activate` | Activate after owner confirmation |
| `GET` | `/ticket-templates/:id/preview.pdf` | Preview with sample data |
| `GET` | `/ticket-templates/:id/calibration.pdf` | Calibration sheet |
| `GET` | `/ticket-batches/:id/print.pdf?layout=sheet\|single\|data-layer` | Print outputs |
| `POST` | `/sales/lookup-ticket` | Read-only sellability check by token or serial |
| `POST` | `/sales` | Extended: `tickets: [{token}]` or manual `{serial}` entries; quantity items admin only |
| `POST` | `/stock/issues` | Issue tickets to a seller |
| `POST` | `/stock/returns` | Return unsold tickets |
| `POST` | `/stock/losses` | Mark lost or damaged (revokes) |
| `GET` | `/stock/sellers/:id/statement` | Seller statement |
| `GET` | `/stock/issues/:id/slip.pdf` | Issue slip |
| `POST` | `/remittances` | Record handover of money |
| `POST` | `/remittances/:id/reverse` | Reverse a remittance |

Standard errors apply (401, 403, 404, 409 for conflicts and invalid states, 422, 429). Mutations require idempotency keys.

## A9. Permissions

| Action | Admin | Seller | Verifier | Supervisor |
| --- | --- | --- | --- | --- |
| Manage ticket templates | Yes | No | No | No |
| Print outputs | Yes | No | No | No |
| Lookup ticket for sale | Yes | Yes | No | Optional |
| Sell by scan | Yes | Yes (issued stock) | No | Optional |
| Manual serial sale | Yes | Only with policy | No | Optional |
| Quantity (bulk) sale | Yes | No | No | No |
| Issue / return / mark lost | Yes | No | No | Optional |
| View own stock and statement | Yes | Own | No | Yes |
| Record remittance | Yes | No | No | Optional |
| View buyer name and phone | Yes | Own sales | No | On duplicate or lookup, audited |

Every action is checked on the server.

## A10. Business rules (additions to PRD 7.5)

16. A ticket is sold only through scan-to-sell, a flagged manual sale, or the admin bulk path. The server identifies it from the token hash, never from a client-supplied id.
17. Lookup for sale never admits and never changes ticket state.
18. When `requireStockIssue` is on, a seller can sell only tickets issued to them.
19. A ticket has at most one active holder (database-enforced).
20. Buyer name and phone are required when `requireBuyerDetails` is on, and phones are stored normalised.
21. A template version is immutable once used for a production print; reprints use the recorded version.
22. The printed QR size and module size must meet the minimums in A3.8 before a template is activated.
23. Remittances are append-only; corrections are linked reversals.
24. A seller can be closed only when every issued ticket is sold, returned or lost.
25. Buyer details never appear on verifier screens; supervisor and admin views of them at the gate are audited.
26. Two sellers scanning the same ticket at the same time produce exactly one sale.
27. With `requireFullPaymentAtSale` on, a seller-created sale must be fully paid at confirmation. A physical ticket is never handed over unpaid. Admin may record a partial payment, and admission still follows the event's payment policy.

## A11. Screens (mobile first, follows `docs/DESIGN.md`)

- **Sell (seller):** full-width camera, cart of scanned tickets (serial, category, price, state), buyer name and phone with +256 hint, payment, sticky total and Confirm, success screen with receipt, "Scan next". Manual serial entry in a bottom sheet, clearly flagged.
- **My stock (seller):** issued, sold, left, takings, balance owed. List of tickets still held.
- **Ticket templates (admin):** upload, numeric zone editor with live overlay preview using sample data, measurement import, version list, calibration print, activate with confirmation.
- **Issue stock (admin):** choose seller, choose tickets, issue slip PDF.
- **Returns and close-out (admin):** scan or select, mark lost, outstanding serials, seller close-out.
- **Remittances (admin):** record handover, seller balance.
- **Gate result (supervisor):** buyer name and phone reveal on duplicate, with an audit note.

## A12. Reports and audit

Add: seller reconciliation, stock position by serial (unissued, held, sold, returned, lost), unsold tickets by holder, issue slips, remittances, sales by entry method (scan / manual / bulk), and template and calibration history. Audit: template upload, activation and retirement; every print output; lookups; sales with entry method; issues, returns, losses, close-outs; remittances and reversals; buyer detail reveals.

## A13. Security and privacy

- Lookup and sale endpoints rate-limited; tokens never logged, never in audit records, never in URLs.
- Template uploads follow the upload rules in A3.5.
- Buyer data collected minimally, restricted by role, and reveals audited.
- A photographed QR of an **unsold** ticket cannot admit anyone (a ticket must be sold and paid). Disputes after sale are settled with the serial and buyer details at the gate.
- Print PDFs and data layers are treated as sensitive files.

## A14. Acceptance tests

1. Template config validation rejects zones outside the trim box, QR below minimum size, and unknown field keys.
2. Template upload rejects SVG, wrong signature, oversize, and wrong aspect ratio; accepts a valid PNG and JPEG.
3. Template version becomes immutable after a production print; an edit creates a new version.
4. Rendered sheet PDF has correct page size; artwork embedded once; QR decodes from a rasterised render to the exact token.
5. Data-only layer contains no artwork and decodes the same QR.
6. Calibration print is required before production activation.
7. `lookup-ticket` returns each sellability state correctly and never changes data.
8. Sale by token sells exactly the scanned ticket; a different ticket is never chosen.
9. A ticket id supplied by the client is ignored or rejected.
10. Two sellers selling the same ticket concurrently produce exactly one sale and one 409.
11. Seller cannot sell a ticket issued to another seller; admin can, with an audit entry.
12. Buyer name and phone required by policy; phone normalisation accepts the Ugandan formats and rejects junk.
13. Manual serial sale blocked for sellers unless policy allows; always flagged.
14. Admin quantity sale works for admin only.
15. Only one active custody row per ticket (concurrent issue attempts produce one success).
16. Return, loss (revokes) and close-out rules hold; close-out blocked while serials are unaccounted for.
17. Remittance append-only; reversal links; seller balance computed correctly.
18. Verifier screens and APIs never expose buyer name or phone; supervisor reveal is audited.
19. All existing check-in, payment and permission tests still pass.
20. With `requireFullPaymentAtSale` on, a seller sale with a partial or missing payment is rejected, and an admin partial sale is allowed.
21. Composite print output meets the size budget in A3.7 for 500 tickets.
22. Real-paper test: print the calibration sheet and a production sample at the chosen layout, scan the QR from paper on two Android phones, confirm zones line up with the artwork and the stub text is readable.

## A15. Delivery phases

- **Phase 6 — Template and printing.** Template model, upload, zone config, renderer, outputs, calibration, template UI.
- **Phase 7 — Scan-to-sell.** Lookup, sale by token, buyer details, policy flags, sell UI.
- **Phase 8 — Seller stock.** Custody, issue, return, loss, close-out, remittances, statements, slips, reports.
- **Phase 9 — Hardening.** Permissions and audit sweep, privacy checks, real-world print and scan tests, release gate additions.

Phase 6 can start with placeholder zones and a generated sample artwork, while real zone measurements are collected from the owner's design file. Production activation waits for measured values and a real-paper calibration.

## A16. Open decisions

Measured zone coordinates and perforation position · exact stub fields · exact bottom-strip fields and whether price is printed · sheet layout (A, B or C) and who prints · fonts used in the artwork (files needed to match them) · buyer notice wording · whether sellers may ever sell by manual serial · whether supervisors can issue stock and record remittances · replacement serial policy for lost tickets · data-retention period for buyer details.
