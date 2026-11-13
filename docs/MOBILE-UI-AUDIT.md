# Mobile UI/UX audit

Audit basis: `docs/DESIGN.md`, using the Account page's simple heading + separated-card hierarchy as the consistency reference. This is a code audit; authenticated pages and physical-device interactions still need visual review in a signed-in phone browser.

## Route inventory

| Area | Routes/components | Current finding | Priority |
| --- | --- | --- | --- |
| App shell | dashboard layout, mobile tabs, account menu | Safe areas and bottom tabs exist; route labels and role nav are clear. Keep shell minimal. | P2 |
| Account/auth | account, login, password form, install card | Good card grouping. Profile metadata and descriptions are deliberately secondary. Sticky password action must clear the tab bar. | P2 |
| Dashboards | overview, role dashboards, quick actions | Compact two-column metrics and recent rows are dense at 360px; secondary text is often 12–14px. | P1 |
| Events | list, create, detail, ticket types, branding, templates | Event cards are responsive; ticket-type table and template editor need phone-first controls/review. | P1 |
| Sales | list, create, detail, payment actions, scan-to-sell | List cards and sticky sale footer exist. Sale detail payment history is a horizontal table on phones. | P1 |
| Tickets | inventory, detail, batch generation/detail, print | Inventory cards exist. Ticket and batch detail history tables scroll horizontally on phones; ticket types also use a dense table. | P1 |
| Check-in | scanner, manual, recent, attempts, result | Main scan path has large actions, offline state, dynamic height and takeover results. Attempt cards use undersized metadata; verify keyboard and 360px fit. | P1 |
| Stock | stock workspace, slips, remittance | Workspace is highly compressed source/layout; inspect controls, tabs, and remittance forms for wrapping and safe action placement. | P1 |
| Team | team list and create/edit dialogs | Responsive cards exist; dialogs use sheets, but table/role controls and action spacing need review. | P2 |
| Reports/audit | report filters/results, audit search/history | Filter sheets and mobile cards exist. Large report values and audit summaries need wrapping checks. | P2 |
| Shared patterns | page headers, lists, filters, dialogs, buttons, inputs | `PageHeader` is mostly unused; page titles/actions vary. Several list-card descriptions are 12–14px, below the 16px body-text rule. | P1 |
| Confirmations | stock operations, check-in correction | Native `confirm`/`prompt`/`alert` dialogs interrupt the app and are hard to use on phones. Replace with existing bottom-sheet/dialog patterns while preserving the same server checks. | P1 |

## Planned order

1. Normalize page heading and description spacing, preserving existing title/actions.
2. Convert phone-side history tables to readable stacked records; keep desktop tables unchanged.
3. Review compact text, overflow and touch actions in dashboards, event types, stock and template tools.
4. Recheck route inventory and run typecheck/lint. Verify signed-in routes on a phone before calling the mobile audit complete.

## Changes made

- Applied the supplied reference as the app-wide visual direction: warm cream canvas, clean white cards, warmer borders and shadows, coral primary actions, and a raised rounded mobile navigation bar. The scanner shell shares this style; its actual camera viewport remains dark for image contrast.
- Follow-up reference pass: the radius scale is now squarer and shared by controls and manual card surfaces; event creation no longer nests bordered accordions and instead groups fields into clear sections. Product icons keep their existing meaning and use a finer outlined stroke. The selected bottom tab is coral-filled.
- Restyled the verifier dashboard and account profile to use the same card hierarchy. Status/result badges retain their success, warning and error semantics.
- Reused the account-page heading hierarchy via `PageHeader` on the main list, create and template routes; the stock page now follows the same pattern.
- Added narrow-screen ticket-category cards and mobile payment, print and audit history cards. The existing desktop tables remain at tablet/desktop widths.
- Raised compact dashboard summaries and selected filter labels to at least 14–16 px, matching the app's readable mobile text and 16 px input guidance.
- Replaced browser-native confirmation prompts in stock reconciliation and admission correction with the shared mobile sheet/dialog. Existing API calls and required confirmation data are preserved.
- Retained and audited safe-area padding, scanner dynamic viewport sizing, 48 px scanner controls and bottom navigation touch targets from the mobile foundation pass.

## Verification and remaining review

Source review covers the route inventory above. The local browser preview at `/login` returns HTTP 200 and reflects the shared design; protected pages require an account, so their route-specific visuals could not be reviewed in this browser session. No credentials were entered. Android touch, camera, and safe-area behavior still need a physical device check. `pnpm typecheck`, `pnpm lint`, and `git diff --check` pass. Overnight event-window validation passes 25 focused unit tests. The restarted local server reports its development database is missing `TicketType.color` (P2022); no migration or reset was run.

## Status

Reference-driven visual implementation and source review are complete. Authenticated browser review and physical-phone verification remain open.
