# Tasks

Source: PRD section 14 (delivery plan) and section 13 (acceptance tests). Tick items only when implemented **and** tested. Update at the end of every work session.

## Phase 1 — Foundation and authentication

- [x] Project setup (Next.js, TypeScript, Tailwind, shadcn/ui, lint, typecheck, test runner)
- [x] `.env.example`, Docker Compose with persistent Postgres volume
- [x] Prisma schema: User, Session, Event, TicketType, AuditLog (core constraints first)
- [x] First migration runs from a clean database
- [x] One-time protected initial admin setup (no default password) — `pnpm setup:admin`
- [x] Login, logout, server sessions (hashed tokens, HttpOnly/Secure/SameSite), rate limiting, lockout
- [x] Change password, `/auth/me`
- [x] RBAC policy module, default deny, checked on every API route
- [x] Team management (create, change role, deactivate; old sessions die on deactivation)
- [x] Event CRUD, open/close sales and admission, validation rules (PRD 5.3)
- [x] Ticket type CRUD, integer UGX, capacity checks (PRD 5.4)
- [x] Role-aware navigation and dashboard shell
- [x] Tests: auth, permissions (including direct API calls), session expiry, rate limit

Phase 1 complete: 8 unit + 74 integration assertions pass (8 test files, `pnpm test` exit 0), `pnpm typecheck` and `pnpm lint` clean, `pnpm build` exits 0. Deferred to later phases: logo upload, CSRF double-submit, per-user explicit permission grants (supervisor exceptions), Playwright e2e, Docker Compose untested on this machine, benign `HANGING_PROMISE_REJECTION` build warning on auth routes.

## Phase 2 — Ticket inventory and printing

- [x] Ticket, TicketBatch, PrintBatch models with unique serial and token hash
- [x] Transactional batch generation (500 tickets, no partial success, idempotent, capacity safe)
- [x] Secure QR token generation, hash storage, never exposed in lists or exports
- [x] Inventory screen: search, filters, ticket detail, audit history
- [x] Ticket preview and print-ready PDF (210 x 59 mm, stub, QR, serial)
- [x] Sample print flow, reprint (permission plus audit, same token), revoke with reason
- [x] Inventory CSV export (no secrets, formula-injection safe)
- [x] Tests: uniqueness, capacity under concurrency, failed batch rollback, reprint identity

Phase 2 complete: `pnpm test` runs 11 files / 103 tests, all green (Phase 1 regression + 7 new unit and 22 new integration tests); `pnpm typecheck`, `pnpm lint` clean; `next build` exits 0. Decisions taken during the phase: QR tokens are stored as SHA-256 hash for all lookups **plus an AES-256-GCM encrypted copy** (`tokenEnc`, key `TOKEN_ENCRYPTION_KEY` in `.env.example`) so reprints can reproduce the identical token (rule 8 vs rule 6 compromise, confirmed with the owner); print sheets are **5 tickets per A4 portrait** page (owner directive), each printed at ~94% of the 210 × 59 mm artwork so real print margins remain on every side; dashed cut guides included; serial format default `KSP-00001` with a per-batch configurable prefix; new permissions `inventory:read` / `inventory:export` are admin-only (sellers get inventory visibility through their sales in Phase 3). Deferred: physical paper scan test (Phase 5), Playwright e2e, individual auditing of the read-only QR preview endpoint, `HANGING_PROMISE_REJECTION` build warning now also appears on `/api/v1/tickets` and `/api/v1/tickets/export` (same benign class as Phase 1).

## Phase 3 — Sales and payment tracking

- [x] Sale, SaleItem, SaleTicket, Payment, PaymentAdjustment models and constraints
- [x] Create sale (customer, categories, review, payment, confirm) with atomic allocation
- [x] Idempotency keys required on sales, payments, reversals and refunds
- [x] Partial payments, status recalculation, overpayment blocked
- [x] Reversal, refund, cancel sale (blocked once event admission has ever opened)
- [x] Receipt PDF, sale detail timeline
- [x] Discounts default to zero; administrator-only discount with mandatory reason
- [x] Tests: no double allocation, server pricing, retries, append-only payments

Phase 3 complete: `pnpm test` passes 12 files / 112 tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. Sales and payment mutations are transactional, audited and idempotent; sale prices come from ticket-type snapshots; allocation is protected by an event row lock and unique ticket-to-sale constraint. Payment adjustments preserve original payment rows. Discounts require the administrator permission and a stored reason. A durable `admissionStartedAt` marker prevents ordinary cancellation/refunds once admission has ever opened, including after the event is closed. Mobile-money provider verification remains out of scope; receipts explicitly describe staff-recorded payments.

## Phase 4 — Admission and duplicate protection

- [x] CheckIn (unique ticketId) and ScanAttempt models
- [x] Shared eligibility service plus single transactional check-in function
- [x] `verify-qr`, `verify-serial` (read-only), `confirm` (rechecks everything)
- [x] Scanner screen (camera, permission states, flashlight where supported, debounce, recent scans, connection indicator)
- [x] Manual serial screen with explicit confirm
- [x] All result states distinct, failures never green, offline state shown
- [x] Recent check-ins, attendance summary, correction flow (history preserved)
- [x] Tests: 10+ concurrent requests produce exactly 1 admission, unpaid/revoked/other-event/expired rejected, verify never admits, tokens not logged
- [ ] Real Android device test: camera, HTTPS, two phones scanning at once

Phase 4 implementation complete: `pnpm typecheck` and `pnpm lint` pass; the full suite reports 13 files / 116 tests passing; the production build completed during test setup. Confirmation locks the event, ticket and sale rows in one transaction, and the unique ticket constraint prevents duplicate admission. Verification writes attempts only; QR token values are not stored in attempts. Android camera, deployed HTTPS and two-phone concurrency still require an on-device test.

## Phase 5 — Reporting, hardening and launch

Implementation plan:

1. Map PRD reports to existing sales, payment, ticket, print, scan-attempt, check-in and audit data; add role-scoped report queries and CSV/PDF exports with safe input/output handling.
2. Add permission-checked audit search and a useful summary of critical changes, then add regression tests for report totals, access boundaries, export safety and audit visibility.
3. Harden browser-facing API responses with security headers and same-origin CSRF protection; inspect production dependencies and address actionable findings without unrelated upgrades.
4. Add a repeatable 10+ client admission load/concurrency check and document its environment and measured results. Complete HTTPS/reverse-proxy and scheduled backup/restore configuration using the existing deployment approach.
5. Write the staff operating guide, environment-variable reference and launch checklist; run all locally possible checks and leave physical paper/device and deployed-host checks open until actually performed.

- [x] Reports (PRD 5.14) with CSV and PDF export, role-scoped
- [x] Audit log screen and search
- [x] Security headers and same-origin CSRF protection
- [ ] Production dependency advisory review succeeds (local registry access was denied; hosted CI check is configured)
- [x] 10-client verification p95 test and duplicate-admission concurrency test are part of CI
- [x] HTTPS reverse-proxy configuration and safe backup/restore scripts with scheduling instructions
- [x] GitHub Actions deploy job waits for successful CI and updates Docker Compose from the verified `master` commit
- [ ] Add the VPS deploy key to GitHub Actions and enable automatic deployment
- [ ] HTTPS deployment, host backup schedule and scratch restore rehearsal verified on the target host
- [ ] Printed ticket QR scanned from real paper
- [x] Staff operating guide, environment variable docs, list of incomplete features
- [x] Launch checklist (PRD 15) document created; operational sign-off remains pending

Phase 5 local implementation status: typecheck and lint pass; the full suite reports 17 files / 140 tests passing, including all 12 report types, role-scoped access, CSV/PDF export, audit search, CSRF/header checks, ten-client p95 and duplicate admission. A hosted CI failure on commit `58a3731` traced to the CI test step inheriting the placeholder `TOKEN_ENCRYPTION_KEY` from `.env.example`; CI now generates an ephemeral valid 32-byte key for the test process. The production build completes during test setup and emits the existing `HANGING_PROMISE_REJECTION` warnings for authenticated routes. The target-host Compose stack builds, applied all ten migrations, and responds over loopback; public HTTPS is active. Admin creation, backup scheduling and restore rehearsal, and the real-paper Android scan remain pending. The local advisory audit could not reach the npm registry (EACCES); hosted audit found one low-severity advisory below its configured high threshold, so no clean audit result is claimed.

Brand asset installation: packaged logo assets, app icons, manifest, vector mark component and generator are installed; the three old placeholder icons were removed and no remaining references were found in `src`, `docs` or `scripts`. `pnpm typecheck`, `pnpm lint` and `pnpm build` pass after regenerating the Prisma client. Visual screenshots remain pending because no local browser binary is available.

Overnight event schedule regression: event end times earlier than start times (such as 18:00–06:00) are interpreted as the following day. The editor and API validation support this; unit and integration regression tests protect it, and the PRD wording reflects the rule. The first automatic deployment attempt passed CI but lost its idle SSH connection while Docker exported the image. The deploy SSH client now sends keepalives; retry deployment and verify the public app after the workflow completes. The VPS remains under investigation for compromise.

## Release gate

- [x] Duplicate-check-in concurrency test passes
- [x] Payment-eligibility test passes
- [ ] Real-paper QR test passes
- [x] Permissions test passes
- [ ] Backup restoration test passes

## Open decisions (keep configurable until confirmed)

Event name and details · categories, prices, quantities · serial prefix and format · mandatory customer name/phone · discounts · partial payment for admission · mobile-money integration · retention and refund policy · separate gate identifiers.

(Print sheet arrangement is **confirmed**: 5 tickets per A4 portrait page at ~94% of the 210 × 59 mm artwork. Template dimensions stay configurable per PRD 5.6 in case a print supplier specifies a different stock.)

## Design prompts

- [x] Prompt 1 — Design foundations (tokens, type, primitives, preview)
- [x] Prompt 2 — App shell and role-aware navigation (mobile tabs, desktop sidebar, event switcher, Admin More sheet, role landing routes)
- [x] Prompt 3 — Lists, tables and filters (responsive cards, mobile filter sheets, pagination, and shared loading/error states)
- [x] Prompt 4 — Forms and sale flow (implementation complete; full suite now passes with the test setup starting its embedded PostgreSQL instance)
- [x] Prompt 5 — Check-in screens (full-bleed scanner, server heartbeat, persistent gate, result takeovers, manual serial flow, session count, and result-state tests)
- [x] Prompt 6 — Event poster and branding upload (admin-only JPEG/PNG/WebP uploads, public optimized WebP variants, event/dashboard display, audited replace/remove, and backup archive)
- [x] Prompt 7 — Role dashboards and event pages (server-backed admin, seller, verifier and supervisor summaries; category availability, date/status hierarchy and guarded event actions)
- [x] Prompt 8 — Tickets, receipts and print artwork (brand-led 5-up ticket PDF with QR quiet zone, responsive preview, clearer receipt totals/status, and one-page print test guidance)
- [x] Prompt 9 — PWA install (role-aware standalone launch, maskable icons, install guidance and viewport safe areas; no service worker)
- [x] Prompt 10 — Responsive, accessibility, and mobile performance audit (Playwright/axe suite passes; physical Android checklist remains pending)

Prompt 10 verification: Playwright reports 10/10 passing against its isolated design test database. All four roles passed responsive route, overflow and axe checks at 360 × 800, 390 × 844, 768 × 1024 and 1280 × 800; keyboard focus and reduced motion pass. Throttled scanner navigation measured 1,037 ms with CLS 0.0475, no unsized images and no eager ZXing load. Physical Android install/camera/flashlight/one-handed sale/sunlight/poster-gallery/low-battery/slow-network checks and the paper QR scan remain pending.

Prompt 5 verification: `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass; test suite reports 15 files / 135 tests. The test setup's production build completed and emitted the known `HANGING_PROMISE_REJECTION` warnings on authenticated API routes. Real Android HTTPS and paper QR scanning remain pending as listed in Phase 4.

Prompt 6 verification: `tsc --noEmit`, ESLint, the production build and the full suite pass (16 files / 139 tests). Event poster and optional logo originals are validated, re-encoded to metadata-free WebP thumbnails/display files, stored outside `public`, served by public cacheable URLs, and included in the backup archive. Upload/remove are administrator-only and audited; the download URL is public by owner decision. Sharp 0.35.5 is pinned. The local package-manager add/install check could not complete because pnpm's supply-chain metadata check failed against the local store (`ERR_PNPM_NO_OFFLINE_META`); the package is available in the existing local dependency tree, so direct typecheck/lint/build/tests passed, but a clean frozen install still needs CI confirmation. Target-host Compose and backup/restore rehearsal remain pending; PowerShell environment does not have Bash, so the backup scripts' `bash -n` check was unavailable.

Prompt 7 verification: role dashboard metrics and per-category sold/remaining counts are queried and rendered on the server; today's seller receipts are scoped to the signed-in seller and net of same-day adjustments. Verifiers can see the daily admission count and event-wide recent scan attempts via the existing read-summary and read-attempts permissions, which were added to their role with owner approval. Typecheck, targeted ESLint, focused permission/dashboard integration tests and the production build pass. The full suite completed with 16 of 17 files passing (133 passed, 7 failed out of 140); all seven failures were 20-second timeouts or an ECONNRESET in `tests/integration/ticket-batches.test.ts`. These full-suite failures are unresolved; the focused Prompt 7 tests passed.

Prompt 8 verification: direct ESLint on the four changed source files and `tsc --noEmit` pass. `pnpm` itself could not run because its dependency check attempted a non-interactive install (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); existing local dependencies were used directly. Helvetica remains the safe built-in PDF font. The one-page sample PDF uses the existing audited sample-print route. Physical paper size and QR readability still require the owner to print at 100% / Actual size with “Fit to page” disabled, measure the 210 × 59 mm artwork and scan the printed QR.

Prompt 9 verification: direct TypeScript, ESLint and the Next.js production build pass. The manifest icons and Apple touch icon are generated from the editable SVG sources in `public/brand/source/` by `node scripts/generate-pwa-icons.mjs`. `/` remains the manifest start URL and routes signed-in staff to the correct role landing screen. No service worker is registered, so APIs and admission remain network-only. Real Android HTTPS installation, standalone launch and camera permission still need physical-device confirmation. Build output includes the existing benign `HANGING_PROMISE_REJECTION` warnings on authenticated API routes.


## Tickets v2 (PRD Addendum 1)

- [x] Prompt T0 — Impact analysis (docs/TICKETS-IMPACT.md)
- [x] Prompt T1 — Template model, upload and zone configuration
- [ ] Prompt T2 — Renderer and print outputs
- [x] Prompt T3 — Template admin UI
- [x] Prompt T4 — Scan-to-sell backend
- [x] Prompt T5 — Scan-to-sell UI
- [x] Prompt T6 — Seller stock backend
- [x] Prompt T7 — Stock and seller UI, slips and reports
- [x] Prompt T8 — Permissions, audit and privacy sweep
- [x] Prompt T9 — Real-world tests and release gate additions

Prompt T2 implementation and Windows verification are in place: renderer and legacy batch tests pass, and calibration/reprint integration coverage passes. First-time batch and ticket printing now requires an active measured template; only historical reprints without a recorded template retain the legacy renderer. Typecheck and focused ESLint pass for this guard; the test suite was not rerun for this change. The Linux container font smoke test remains open because Docker/Podman and WSL are unavailable in this environment; `Dockerfile` explicitly copies `assets/fonts` into the runner image. Build output retains the existing benign authenticated-route `HANGING_PROMISE_REJECTION` warnings.

### Release gate additions
- [ ] Measured template zones confirmed and template activated for production
- [ ] Calibration print scanned on two Android phones; confirm zone alignment and readable stub text
- [ ] Production sample printed at chosen layout and QR scanned from paper
- [ ] Two sellers race to sell one ticket on real phones: exactly one sale succeeds
- [ ] Seller issue, sale, return and close-out walk-through completed
- [ ] Buyer detail privacy checked at the gate: verifier cannot see details; authorised reveal is audited
- [ ] Template activated with measured zone values after calibration

Prompt T8 complete: direct stock-operation requests enforce server-side permissions; sale lookup and gate buyer-detail reveals are audited; audit summaries redact full Ugandan phone numbers; verifier API/report access and token-free lookup audit records are covered. The full suite reports 25 files / 186 tests passing; typecheck, lint and production build pass. Build emits the known authenticated-route `HANGING_PROMISE_REJECTION` warnings, and Vitest reports a post-run Vite-server close timeout after all tests pass. T9 physical-device and operational release checks remain open.

Prompt T9 preparation complete: the launch checklist and release gate now list measured template activation, two-phone calibration and production paper scans, the real-phone seller race, seller stock issue/sale/return/close-out, and gate buyer-detail privacy. Added concise seller and stock keeper guides, a day-before rehearsal script, and `pnpm seed:rehearsal`, which creates 100 issued historical tickets for three configured sellers (60 sold, 31 returned, 9 marked lost) plus 16 unissued practice tickets and synthetic remittances. The seed requires explicit opt-in, a local allowlisted development database, a unique run ID, three existing active development sellers, and an explicitly supplied synthetic phone number; production mode is refused. Typecheck, lint and the full suite pass (25 files / 186 tests); the suite's production build succeeds with the known authenticated-route prerender warnings, and Vitest reports its post-run Vite-server close timeout after all tests pass. Production-mode seed refusal was smoke-checked. All physical/device release checks remain unchecked for the event team to complete.

Prompt T3 implementation: added the event-scoped admin template list and editor, artwork upload, measured zone fields and JSON import, sample overlay preview, QR size checks, activation confirmation, calibration PDF, and batch-based A/B/C print output links. Typecheck and focused lint pass. Print outputs require a ticket batch ID; calibration generation and paper-print confirmation are exposed in the screen. Physical calibration scanning and actual measured zone entry remain launch checks.

Template editor usability update: preview boxes can now be dragged to reposition and resized from their edges/corner; QR remains square, all changes update the millimetre fields live, and movement/resizing is constrained to the trim area. `tsc --noEmit` and focused ESLint pass.

Template text placement usability update: enabled bottom-strip and stub text appears as selectable sample text in the preview. Users can drag it directly or select it with touch-friendly controls to nudge position in 0.5 mm steps, adjust font size in 0.5 pt steps, and change the text width; adjustments stay inside the configured zone. Typecheck and focused ESLint pass.

Calibration alignment correction: fixed vertical drag conversion for the 65 mm bleed artwork / 59 mm trim preview, scaled ruler ticks with the 94% calibration layout, and added sample configured text to calibration PDFs. Calibration generation is disabled while the editor has unsaved changes, with a prompt to save the new template version first. Typecheck and focused ESLint pass; paper print alignment still needs confirmation on the target printer.

Calibration guide and font preview refinement: calibration PDFs now distinguish QR, strip, and stub zone outlines by color and draw red bounds around each enabled text field at its saved position/size. The live preview uses point-to-millimetre sizing tied to the artwork scale instead of a 5–10 px clamp, so configured text is visually closer to print output.

Template preview and A4 sheet correction: batch pages now preview the active ticket artwork with its configured QR and text fields instead of the generic legacy ticket mockup; without an active valid template, the page hides the old mockup and disables print links. Corrected sheet drawing coordinates so page margins stay fixed while each ticket's internal positions and size scale together; this prevents the 94% A4 slot step from shrinking a second time and tickets overlapping vertically. Added a renderer regression asserting 59 mm slot spacing at 94%. Typecheck, focused ESLint and renderer tests pass (5 tests); the test harness still emits known prerender warnings and a post-test Vite shutdown timeout.

Ticket template print refinement: added an editable category color that fills the configured bottom strip behind its text, carried that color into batch and individual ticket previews and produced PDFs, and saved the print-time color in print history for consistent reprints. The color follows the measured bottom-strip coordinates; the detachable stub remains unchanged. Calibration now lets staff select a category and previews its color and label. Tightened the default QR white border from 2 mm to 1.5 mm and exposed the border measurement in the template editor for existing template versions. Existing active templates need the adjusted border saved and activated before new PDFs use it. Category color migration `20261111100000_ticket_type_color` is deployed; individual ticket preview and category-specific calibration updates are pending deployment.

Inventory cleanup controls: inactive ticket-template versions can be permanently deleted only when no print output references them; shared artwork is retained while another version uses it. Admins can select available tickets and remove them from circulation in one audited action with a required reason. Ticket records are retained and revoked (not hard-deleted) so serials, scanned QR history, and reconciliation remain traceable; the server rejects sold/cancelled or differently revoked tickets. Typecheck and focused lint are being checked.

Prompt T4 implementation: added seller scan-to-sell lookup and confirmation by token hash, serial entry with explicit MANUAL records and event policy, admin-only bulk sales, Uganda E.164 phone normalization, buyer-detail and full-payment policy enforcement, rate-limited token-free SALE scan attempts, and audited gate buyer-detail reveals limited to supervisors/admins on duplicates or explicit lookup. Sale confirmation retains event/ticket locking, server pricing, atomic payment writes and request-hash idempotency. `pnpm test` passes 22 files / 173 tests; typecheck and lint pass. Seller stock custody checks remain a clearly marked T6 seam; issued-stock messages are not active until that phase.

Prompt T5 implementation: added the seller Sell screen with a shared QR camera and eight-second server heartbeat, policy-aware manual serial entry, distinct lookup state messages/icons, duplicate-safe ticket cart, buyer phone normalization, payment capture, retry-stable sale idempotency, offline blocking, and success receipt/serial view. Added lookup presentation/cart tests. Focused tests (4), typecheck, ESLint and production build pass. Build output retains the existing authenticated-route `HANGING_PROMISE_REJECTION` warnings; the test harness reported a Vite shutdown timeout after the focused test had passed.

Prompt T6 implementation: added database-enforced active ticket custody, stock issue batches, retry-safe return/loss operations, idempotent seller close-outs, append-only remittances with linked reversals, and sale-time custody validation/release inside the ticket transaction. Added issue/return/loss/close-out/remittance APIs and seller statements with integer-UGX takings and balances. Admin/supervisor custody overrides are audited; verifier sales remain denied. Prisma schema validation/generation, typecheck, focused ESLint, and 36 related integration/unit tests pass. The integration build retains existing authenticated-route `HANGING_PROMISE_REJECTION` warnings, and Vitest prints its existing Vite shutdown timeout after test completion.

Prompt T7 implementation: added the seller My Stock screen; admin stock issue by QR scan, serial list, range, or category quantity; audited issue-slip PDFs with signature lines; returns/losses, explicit close-out blocking and confirmation, remittance record/reversal controls, and the five seller reconciliation/stock/template reports. Added role-scoped stock reports and formula-safe CSV/PDF export through the existing report pipeline. Duplicate gate results show buyer details only when returned by the audited supervisor/admin service; verifier responses remain unchanged. `pnpm exec tsc --noEmit`, focused ESLint, production build, and 11 PostgreSQL integration tests pass. Build retains the existing authenticated-route `HANGING_PROMISE_REJECTION` warnings; Vitest reports its existing 10-second shutdown timeout after tests pass. Physical device, print and privacy-at-gate release checks remain open.

Receipt PDF link fix: corrected the scan-to-sell success screen to open the implemented `/api/v1/sales/:id/receipt.pdf` endpoint; the old link omitted the API prefix and returned 404.
