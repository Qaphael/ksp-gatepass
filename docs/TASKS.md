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

- [ ] CheckIn (unique ticketId) and ScanAttempt models
- [ ] Shared eligibility service plus single transactional check-in function
- [ ] `verify-qr`, `verify-serial` (read-only), `confirm` (rechecks everything)
- [ ] Scanner screen (camera, permission states, flashlight, debounce, recent scans, connection indicator)
- [ ] Manual serial screen with explicit confirm
- [ ] All result states distinct, failures never green, offline state shown
- [ ] Recent check-ins, attendance summary, correction flow (history preserved)
- [ ] Tests: 10+ concurrent requests produce exactly 1 admission, unpaid/revoked/other-event/expired rejected, verify never admits, tokens not logged
- [ ] Real Android device test: camera, HTTPS, two phones scanning at once

## Phase 5 — Reporting, hardening and launch

- [ ] Reports (PRD 5.14) with CSV and PDF export, role-scoped
- [ ] Audit log screen and search
- [ ] Security headers, CSRF protection, dependency review
- [ ] Load test (10+ clients, p95 under 1 s) and concurrency test in CI
- [ ] HTTPS reverse proxy, backups on a schedule, restore rehearsal
- [ ] Printed ticket QR scanned from real paper
- [ ] Staff operating guide, environment variable docs, list of incomplete features
- [ ] Launch checklist (PRD 15) completed

## Release gate

- [ ] Duplicate-check-in concurrency test passes
- [ ] Payment-eligibility test passes
- [ ] Real-paper QR test passes
- [ ] Permissions test passes
- [ ] Backup restoration test passes

## Open decisions (keep configurable until confirmed)

Event name and details · categories, prices, quantities · serial prefix and format · mandatory customer name/phone · discounts · partial payment for admission · mobile-money integration · retention and refund policy · separate gate identifiers.

(Print sheet arrangement is **confirmed**: 5 tickets per A4 portrait page at ~94% of the 210 × 59 mm artwork. Template dimensions stay configurable per PRD 5.6 in case a print supplier specifies a different stock.)
