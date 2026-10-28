# Design prompt pack

Run in order. Use **Plan mode** (Tab) for the first message of each prompt, review the plan, then switch to **Build** mode. Run with `/design <number>` or paste the prompt. After each prompt: `/verify`, then `/design-check`, then look at the result on a real phone (or Chrome DevTools at 360 x 800), then commit.

Shared rules for every prompt (already in `AGENTS.md` and `docs/DESIGN.md`):
- Follow `docs/DESIGN.md`. Tokens only, no hard-coded colours.
- Do not change business logic, API contracts, permissions or database rules. If a design needs one, stop and ask.
- Plan first, wait for approval, then implement in small steps.
- Keep existing tests green. Add tests only for new behaviour (for example the poster upload).
- Finish with: what changed, screens touched, how to see it, open issues.

---

## Prompt 0 — Design audit (read-only)

```
Read docs/DESIGN.md. Do not change any files in this task.

Audit the current UI against the spec. For every page under src/app/(dashboard) and (auth), and every component under src/components, report:
1. Layout at 360 px: horizontal overflow, tables that do not fit, fixed widths, desktop-only patterns, hover-only controls.
2. Tap targets under 44 px and text under 16 px.
3. Hard-coded colours or spacing instead of tokens, and contrast problems.
4. Missing loading, empty, error or success states.
5. Navigation: how a verifier, seller, supervisor and admin each reach their main action on a phone.
6. Status shown by colour alone.

Write the findings to docs/DESIGN-AUDIT.md as a table (screen, problem, severity, fix, which prompt number fixes it), plus a short list of the 5 worst problems. Then stop.
```

Done when: `docs/DESIGN-AUDIT.md` exists and you agree with the worst-5 list.

---

## Prompt 1 — Design foundations (tokens, type, primitives)

```
Read docs/DESIGN.md sections 2, 4 and 8, and docs/DESIGN-AUDIT.md.

Goal: one source of truth for the visual language.

Plan first, then:
1. Define colour, radius, spacing, shadow and type tokens in globals.css (Tailwind v4 theme) using the brand palette in the spec. Include semantic tokens: success, warning, danger, info, each with a foreground pair. Check every foreground/background pair for AA contrast and list the ratios.
2. Load one font family with next/font and set tabular numerals for numbers. Add a monospace token for serials.
3. Update the shadcn primitives in src/components/ui (button, input, select, textarea, card, badge, dialog, table, alert) so default sizes are mobile-friendly: 48 px inputs and buttons, 44 px minimum targets, 16 px text, clear pressed and focus states. Add a large (56 px) button size.
4. Add small shared components: Money (UGX formatting), Serial (monospace display), StatusBadge (fixed status to colour + icon + label mapping for ticket, sale, payment, event and scan states), PageHeader, EmptyState, ErrorState, Skeleton helpers.
5. Add a temporary /design-preview page (admin only, removed before launch or guarded) that renders every token and component at 360 px so I can review it.

Do not restyle pages yet.
```

Done when: `/design-preview` looks right at 360 px and contrast ratios are listed.

---

## Prompt 2 — App shell and navigation

```
Read docs/DESIGN.md sections 3 and 8.

Goal: a proper mobile shell.

Plan first, then:
1. Build the shell: slim top app bar (event name chip with switcher, account menu) and a bottom tab bar below lg; sidebar at lg and up. Role-aware items exactly as in the spec. Active state is clear, labels always visible.
2. Verifiers land directly on Scan after login. Sellers land on Sell. Others land on Overview.
3. "More" for admins opens a bottom sheet listing the remaining areas.
4. Safe-area padding, 100dvh layouts, no content hidden behind the bottom bar, no horizontal scroll.
5. A slot in the top bar for the connection indicator (wired up in Prompt 5).
6. Keep all existing routes and permissions. Navigation visibility must still come from server-side permissions, and hiding an item is never the access check.

Show screenshots or a description at 360, 768 and 1280 widths.
```

Done when: each role reaches its main action in one tap on a phone.

---

## Prompt 3 — Lists, tables and filters

```
Read docs/DESIGN.md section 5 and docs/DESIGN-AUDIT.md.

Goal: every list works on a phone.

Plan first, then convert in this order: tickets inventory, sales, check-in recent, scan attempts, audit log, events, team, reports tables.
1. Build one reusable ResponsiveList: card list below md (2 to 3 key facts, StatusBadge, whole card tappable), real table from md up.
2. Filters become a "Filters" button opening a bottom sheet on mobile with an active-filter count; inline on desktop.
3. "Load more" on mobile, pager on desktop. Respect existing API pagination limits.
4. Skeleton loading, empty state with the next action, error state with retry on every list.
5. Serial and money use the shared components.

Keep query parameters, API calls and permissions unchanged.
```

Done when: no list scrolls sideways at 360 px and filters are one-handed.

---

## Prompt 4 — Forms and the sale flow

```
Read docs/DESIGN.md section 5 (forms, multi-step) and the current sale, event, ticket type, batch, team and change-password forms.

Goal: forms that are comfortable on a phone.

Plan first, then:
1. Single-column layout, labels above fields, inline plain-English errors, correct inputmode / type / autocomplete, sticky bottom action bar with the primary button.
2. Sale creation as a stepper (customer, tickets, review, payment, confirm): each step fits one screen at 360 x 640, a sticky footer shows the running total and balance, quantity uses a +/- stepper with a numeric field. Preserve form state on validation or network failure and keep the same Idempotency-Key on retry exactly as the code does today.
3. After a sale: a clear success screen with the receipt link, the ticket serials and a primary "Print tickets" action.
4. Destructive or money actions (reverse payment, refund, cancel, revoke, deactivate) use a confirm sheet that shows the reference or serial and requires a reason where the server requires one.
5. Event and ticket type forms: group fields into collapsible sections (basics, dates and times, sales and admission windows, policies, branding).

Do not change validation rules, pricing logic or API payloads.
```

Done when: a full sale can be completed one-handed at 360 x 640 without zooming.

---

## Prompt 5 — Check-in screens (scanner, results, manual, recent)

```
Read docs/DESIGN.md section 6 and src/components/check-in/scanner.tsx.

Goal: the event-day screens must be unmistakable and fast.

Plan first, then:
1. Scanner page full-bleed: camera under a slim dark bar showing gate name and connection status. Large Start/Stop, flashlight where supported, a clear permission-denied state with instructions, and a persistent gate selector remembered on the device.
2. Full-screen result takeover:
   - Admitted: bright success colour, large check icon, "VALID — ADMITTED", category, serial, time, short vibration.
   - Rejected: red or amber by family, large icon, one-line reason, original check-in time and gate for duplicates. Never success styling and never the word "admitted" on a failure.
   Auto-clear after a few seconds for success, require a tap for failures. aria-live assertive.
3. Replace reliance on navigator.onLine with a lightweight server heartbeat every 5 to 10 seconds (for example a tiny authenticated endpoint) driving the OFFLINE banner and disabling scanning. Fetch failures must still show a network error and never a success.
4. Manual screen: big uppercase serial input, no autocorrect, clear button, explicit Confirm button, same result takeover.
5. Recent check-ins as the responsive card list from Prompt 3, with the session's running count.
6. Do not change eligibility logic, idempotency handling or what the server records.

Add component tests for the result states (each failure code renders failure styling, only ADMITTED renders success).
```

Done when: you can scan, see each result type, and read it at arm's length in sunlight.

---

## Prompt 6 — Event poster and branding upload (feature)

```
Read docs/DESIGN.md section 7, docs/business-rules.md, AGENTS.md and the Event model and event service.

Goal: admins can upload an event poster (and optional logo) and it appears across the app.

Plan first. The plan must cover: schema change and migration, storage location (a mounted volume outside public/, added to docker-compose and to the backup script and docs/OPERATIONS.md), image processing approach (check current docs and the allowed build scripts in pnpm-workspace.yaml before choosing a library; ask me if a native dependency is needed), the upload endpoint, the serving route, and tests. Wait for approval.

Requirements:
1. Permission: admin only, enforced server-side, audited (upload, replace, remove) with no file contents in the audit log.
2. Accept JPEG, PNG, WebP only. Max 5 MB. Reject SVG and anything else. Validate by file signature, not by extension or the client MIME type. Reject absurd dimensions.
3. Re-encode, strip metadata, generate a thumbnail (about 480 px wide) and a display variant (about 1200 px wide). Random server-generated file names, never the user's file name. No path traversal.
4. Required alt text field. Store width and height so the UI can reserve space.
5. Serve through a route handler with correct Content-Type, X-Content-Type-Options nosniff, and sensible cache headers. Decide with me whether the poster is public or requires login (default: requires login).
6. UI: upload card in the event form (drag and drop on desktop, camera/gallery picker on mobile), preview, replace, remove with confirm, upload progress and clear errors.
7. Placement: event detail header, a compact hero on the dashboard, and a "Download poster" button. Fixed aspect-ratio container, lazy loading, colour placeholder, no layout shift.
8. The ticket PDF layout does not change.
9. Tests: type validation, size limit, SVG rejection, permission denial for non-admins, replace and remove, audit entries, serving route access.
```

Done when: a poster uploads from a phone, shows on the event page without layout shift, and is included in the backup.

---

## Prompt 7 — Dashboards and event pages

```
Read docs/DESIGN.md sections 2 to 5 and PRD section 5.2 and 5.3.

Goal: role-specific dashboards that read well at a glance on a phone.

Plan first, then:
1. Admin: poster hero (compact), stat cards in a 2-column grid (sold, paid, outstanding, checked in, remaining), recent sales and recent check-ins as short lists, alerts strip, quick actions.
2. Seller: today's sales and money recorded, outstanding balances, a prominent "New sale" button.
3. Verifier: giant "Scan ticket" and "Enter serial" actions, today's count, connection status.
4. Supervisor: admissions and rate, failed and repeated scans, gate breakdown.
5. Event detail page: poster header, status chips (sales open, admission open), key dates, ticket type list with sold / remaining progress bars, and the sales/admission open-close controls as large guarded buttons.
6. All figures still come from the existing server queries. No client-side totals.
```

Done when: each role's dashboard fits one phone screen without hunting.

---

## Prompt 8 — Tickets, receipts and print artwork

```
Read docs/DESIGN.md sections 2 and 7, PRD section 5.6, and the ticket and receipt PDF code and ticket preview component.

Goal: tickets and receipts that look professional and print correctly.

Plan first, then:
1. Polish the ticket artwork inside the existing 210 x 59 mm layout and 5-up A4 sheet: brand green, gold and white, clear hierarchy (event name, date/time/venue, category, serial, QR), generous quiet zone around the QR, readable serial, stub repeats serial and category. Do not shrink the QR or change its token logic, and do not move cut guides.
2. Make the on-screen ticket preview responsive (scales to the screen width, never overflows at 360 px).
3. Polish the receipt PDF: clean header, itemised lines, totals, payments and balance, a clear PAID / PARTIALLY PAID mark, and the existing wording that payments are staff-recorded.
4. Embed the same brand fonts if licensing allows, otherwise use the closest safe PDF font.
5. Provide a one-page "print test sheet" action (sample ticket) for the real-paper QR scan test.

Do not change token generation, ticket identity or reprint behaviour. Tell me what I must test on physical paper.
```

Done when: a sample prints at the right size and the QR scans from the paper.

---

## Prompt 9 — PWA install

```
Read docs/DESIGN.md section 9.

Goal: staff can install the app to their home screen and it feels native.

Plan first, then:
1. Web manifest: name, short name, standalone display, start URL by role-safe route, theme and background colours from tokens.
2. Icons: 192 and 512 px, maskable, generated from the KSP logo placeholder (tell me where to drop the real logo).
3. theme-color meta, apple-touch-icon, viewport-fit=cover.
4. A friendly "Install app" prompt on the account page and a dismissible hint for verifiers and sellers.
5. If a service worker is added it caches static assets only. It must never cache API responses, authentication, tickets, QR tokens or scan results, and there is no offline admission. Show me the exact caching rules before enabling it, or skip the service worker if installability does not need one.
6. Confirm the camera permission works in the installed app over HTTPS.
```

Done when: it installs on a real Android phone and opens full-screen on the scanner for a verifier.

---

## Prompt 10 — Accessibility and device QA

```
Read docs/DESIGN.md section 10.

Goal: prove it works, do not assume.

Plan first, then:
1. Ask before adding dev dependencies. If I approve, add Playwright with a small smoke suite that logs in as each role (using seeded test users), visits the main screens at 360 x 800, 390 x 844, 768 x 1024 and 1280 x 800, checks for horizontal overflow, and saves screenshots. Add axe checks for contrast, labels and focus.
2. Fix every Blocking and Should-fix item found.
3. Check keyboard navigation and visible focus, aria-live on scan results, reduced-motion handling, zoom to 200 percent without loss.
4. Check performance on a throttled mobile profile: scanner route loads the QR library lazily, images are sized, no layout shift. Report numbers.
5. Update docs/DESIGN-AUDIT.md with what was fixed and what remains.

Then give me a short manual checklist for a real Android phone: install, camera, flashlight, one-handed sale, scan results in sunlight, poster upload from the gallery, low-battery and slow-network behaviour.
```

Done when: smoke suite passes, audit file is updated, and you have run the manual checklist on a phone.

---

## Prompt 11 — Final design review

```
Run a final design review of the whole UI against docs/DESIGN.md section 10. Do not change files. Use @reviewer for the checklist and report Blocking, Should fix, Nice to have per screen. Confirm that no business logic, permission, or API contract changed during the design work by comparing the diff of src/server, src/lib/permissions and src/app/api against the last commit before Prompt 1. Finish with a launch-readiness view of the UI only.
```

Done when: no Blocking items and the server-side diff is clean.
