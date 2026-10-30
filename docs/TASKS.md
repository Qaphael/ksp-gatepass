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

Phase 5 local implementation status: typecheck and lint pass; the full suite reports 14 files / 120 tests passing, including all 12 report types, role-scoped access, CSV/PDF export, audit search, CSRF/header checks, ten-client p95 and duplicate admission. The production build completed during test setup. The latest hosted CI run (2026-10-30, commit `9e32b97`) failed typecheck because `LayoutProps` was not defined in a clean checkout; `RootLayout` now uses an explicit `ReactNode` prop and local `pnpm typecheck` passes. The target-host Compose stack now builds, applies all ten migrations and responds over loopback; public HTTPS, interactive admin creation, backup scheduling and restore rehearsal, and the real-paper Android scan remain pending. The local advisory audit could not reach the npm registry (EACCES); hosted audit found one low-severity advisory below its configured high threshold, so no clean audit result is claimed.

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

Prompt 9 verification: direct TypeScript, ESLint and the Next.js production build pass. The manifest, 192/512 px maskable icons and Apple touch icon are generated from `public/icons/ksp-gatepass-placeholder.svg`; replace that source with the approved square KSP logo and run `node scripts/generate-pwa-icons.mjs` to regenerate the icon files. `/` remains the manifest start URL and routes signed-in staff to the correct role landing screen. No service worker is registered, so APIs and admission remain network-only. Real Android HTTPS installation, standalone launch and camera permission still need physical-device confirmation. Build output includes the existing benign `HANGING_PROMISE_REJECTION` warnings on authenticated API routes.
