# KSP GatePass — Agent Instructions

Self-hosted ticket sales and gate verification for KSP Hotel Gulu (first event: 500 tickets, reusable for future events). Mobile-first PWA used on Android phones. **The server and database are the source of truth for every ticket, payment and admission. Phones are only interfaces.**

## Read first

- Full spec: `docs/PRD.md` (authoritative). Do not load it all at once; read the section you need (use the section numbers below).
- Short rules you must never break: `docs/business-rules.md` (always in context via `opencode.json`).
- Task checklist and phase status: `docs/TASKS.md`. Update it when you finish work.

PRD section map: 3 roles/permissions · 5 screens · 6 workflows · 7 lifecycle/business rules · 8 architecture · 9 data model · 10 API · 11 security · 12 performance · 13 tests · 14 phases · 15 launch checklist.

## Stack

Next.js (App Router) + TypeScript + React, Tailwind CSS, shadcn/ui, PostgreSQL + Prisma, Zod for input validation, Argon2id for passwords, Docker Compose + HTTPS reverse proxy. Modular monolith. No microservices, queues, or extra paid services.

Before installing or upgrading anything, check the current stable versions and the library docs. Do not assume APIs from memory (Next.js, Prisma, and the QR scanner library change often).

## Commands

Update this block as soon as the real scripts exist. Until then, treat these as targets.

```
pnpm install
pnpm dev                 # local dev server
pnpm lint
pnpm typecheck
pnpm test                # unit + integration (needs local Postgres)
pnpm test:e2e            # Playwright
pnpm prisma migrate dev  # create/apply migrations locally
pnpm prisma migrate deploy
pnpm db:seed             # dev seed data only, never production
docker compose up -d     # app + postgres
```

## Project layout (logical boundaries; do not create empty folders)

```
src/app/(auth)  src/app/(dashboard)  src/app/api/v1
src/components/{ui,layout,tickets,sales,scanner,reports}
src/features/<domain>/        # auth, events, ticket-types, tickets, sales, payments, check-in, reporting, audit
src/lib/{auth,db,permissions,validation,qr,pdf,rate-limit}
src/server/{services,repositories,policies}
prisma/schema.prisma  prisma/migrations
tests/{unit,integration,e2e}
```

## Non-negotiable rules

1. **Server authority.** Never trust role, user ID, event ID, seller ID, price, total, balance or payment status sent by the browser. Recompute on the server.
2. **One check-in path.** QR and manual serial both go through the same eligibility service and the same transactional check-in function. `verify-*` endpoints are read-only; `confirm` repeats every check.
3. **Duplicate admission is prevented by the database.** Unique `CheckIn.ticketId`, row lock or safe update inside a transaction. Client debouncing is UX only.
4. **Money is integer UGX.** No floats. Sold tickets keep their price snapshot.
5. **Payments are append-only.** Corrections are linked reversals/refunds, never edits or deletes. Same for check-ins.
6. **QR tokens:** cryptographically random, only the hash is stored, never returned in list APIs, CSV exports, logs or audit records. QR must not encode personal data or database IDs.
7. **Keep separate:** ticket inventory status, sale/payment status, admission status. Do not merge them into one field.
8. **Idempotency keys** on sale creation, payment recording, batch generation and check-in confirm. Retries after timeouts must be safe.
9. **RBAC on every server operation**, default deny. Hiding a button is not security. Event-scoped queries must verify event access.
10. **No offline admission.** If the network is down, show OFFLINE — CHECK-IN UNAVAILABLE. Never show a green success for anything the server did not accept.
11. **Do not claim payment verification.** Recorded payment means staff confirmed it, not provider-verified.
12. Configurable, never hard-coded: event details, categories, prices, serial prefix, payment methods, admission/payment policy, discounts, gates. Default policy: full payment required before admission. Timezone `Africa/Kampala`, currency UGX.

## Working agreement

- Work **one phase at a time** (PRD section 14). Start with schema, auth and a visible app shell. Do not generate the whole system in one change.
- Write the plan first, then implement. Run the relevant tests after each phase and report results and open issues before continuing.
- Write and test database constraints and domain services before building UI on top of them.
- Use shared domain services (eligibility, capacity, payments, check-in). Do not duplicate pricing, capacity or eligibility logic.
- Validate all API input with Zod at the boundary. Use stable error codes: 401, 403, 404, 409 (conflict/duplicate/invalid transition), 422, 429, 500. Never leak stack traces, DB details or tokens.
- Never mock a successful admission or API response in production paths. Seed data is dev-only.
- Never weaken a security or business rule to make a test pass. If a rule blocks you, stop and ask.
- Do not add payment-provider integrations, SMS, offline mode or unrequested infrastructure.
- Secrets live in environment variables. Document every variable in `.env.example`. Never commit real secrets.
- No default admin account with a known password. Initial admin setup must be a one-time, protected process.
- CSV exports must guard against spreadsheet formula injection.
- Match existing code style and conventions once they exist. Keep changes small and reviewable. Do not refactor unrelated code.
- Do not run `git push`, destructive migrations, or database resets without asking.

## Definition of done for any task

Typecheck, lint and relevant tests pass; permissions are enforced server-side; audit events are written for critical actions; `docs/TASKS.md` is updated; no unresolved TODOs hidden as "done".

Release gate (PRD 13): no production launch until the duplicate-check-in concurrency test, payment-eligibility test, real-paper QR scan test, permissions test and backup-restore test all pass.

## opencode helpers in this repo

- Agents (`.opencode/agents/`): `@reviewer` (read-only security and concurrency review), `@test-writer` (writes tests, edits only under `tests/`).
- Commands (`.opencode/commands/`): `/phase <n>` start or continue a phase, `/verify` run lint, typecheck and tests, `/review` review the current diff, `/status` refresh `docs/TASKS.md`.

## Current implementation status

Phase 1 (foundation, auth, RBAC, event/ticket-type CRUD, dashboard shell), **Phase 2 (ticket inventory and printing)**, and **Phase 3 (sales and payment tracking)** are complete and tested. `pnpm typecheck`, `pnpm lint`, `pnpm test` (12 files, 112 tests), and `pnpm build` pass. Phase 2 added: Ticket/TicketBatch/PrintBatch schema with CHECK constraints, transactional 500-ticket batch generation (row-locked, idempotency keys, capacity safe), QR tokens (SHA-256 hash + AES-256-GCM encrypted copy under `TOKEN_ENCRYPTION_KEY`), inventory/detail/batch screens with search, filters and audit history, 210 × 59 mm ticket preview + imposed A4 5-up print PDF with sample/full/reprint flows, revoke with mandatory reason, formula-injection-safe CSV export. Phase 3 added: constrained sale/payment/adjustment records, transactional ticket allocation and payment flows, required idempotency keys, admin-only reasoned discounts, append-only reversals/refunds, cancellation guard after admission starts, sales and detail screens, and receipt PDF. Next task: Phase 4 (admission and duplicate protection).

Deferred items: logo upload, CSRF double-submit, per-user explicit permission grants (supervisor exceptions), Playwright e2e, Docker Compose untested on this machine, real-paper QR scan test, benign `HANGING_PROMISE_REJECTION` build warning on auth and ticket GET routes.
