# KSP GatePass — Design spec

Authoritative design rules. Read before touching any UI. Mobile first: design at 360 x 800 first, then enlarge. Colour values below are starting points; the owner may override them. Change tokens in one place (`globals.css`), never inline.

## 1. Who uses it, where

- **Gate staff:** one hand, phone, outdoors or dim hall, queue pressure. Needs huge targets and unmistakable results.
- **Sellers:** phone or tablet, counting cash, short transactions.
- **Admin / supervisor:** phone on the day, laptop for setup and reports.
- Phones are mid-range Android in Chrome. Assume slow, flaky mobile data.

## 2. Brand

Deep green, gold and white (matches the printed ticket). Neat, calm, premium hotel feel. No gradients-for-decoration, no clutter.

| Token | Start value | Use |
| --- | --- | --- |
| `--brand-900` | #0A2A20 | App bar, scanner chrome, dark surfaces |
| `--brand-700` | #0F3D2E | Primary buttons, active nav |
| `--brand-50` | #EEF4F0 | Tinted backgrounds |
| `--gold-500` | #C8A24A | Accents, highlights, focus ring on dark, dividers |
| `--ivory` | #FAF7F0 | Page background |
| `--ink` | #14201B | Body text |

Rules:
- Gold is never body text on white or ivory (fails contrast). Gold text is allowed only on `--brand-900` or `--brand-700`. On light backgrounds gold is a fill or border with dark text.
- Semantic colours are separate from brand. Success (admitted) is a clearly brighter green than the brand green so it is never confused with app chrome. Error is red, warning is amber. Never rely on colour alone: every state also has an icon and a word.
- All text meets WCAG AA (4.5:1, 3:1 for large text). Check every pairing.
- Optional dark mode is allowed, but the scanner and result screens must work in bright sun first.

## 3. Layout and navigation

- Base design width 360 px. Breakpoints: `sm` 640, `md` 768, `lg` 1024 (desktop shell starts here).
- **Below `lg`:** top app bar (event name chip, account menu) plus a **bottom tab bar** of at most 5 items, role-aware:
  - Verifier: Scan, Manual, Recent
  - Seller: Sell, Sales, Tickets
  - Supervisor: Overview, Scan, Attempts, Reports
  - Admin: Overview, Sales, Tickets, Check-in, More (events, team, audit, settings, reports)
- **At `lg` and up:** left sidebar, same items.
- The primary action for the role is always one tap from launch (verifier opens straight to Scan).
- Respect safe areas: `env(safe-area-inset-*)`, `100dvh` not `100vh`, bottom bar clears the gesture area.
- No horizontal page scroll at any width. Wide content scrolls inside its own container.

## 4. Touch and type

- Minimum tap target 44 x 44 px. Scanner and confirm actions 56 px or more. 8 px minimum gap between tappable items.
- Body text 16 px minimum. Inputs 16 px minimum, height 48 px.
- One typeface family via `next/font`, with a system fallback. Tabular numerals for money, counts and serials. Serials in a monospace face, large and spaced.
- Money always formatted `UGX 150,000`. Dates and times in Africa/Kampala, short and consistent.
- Use `inputmode="numeric"` / `type="tel"` / `autocomplete` correctly. Never use hover-only affordances.

## 5. Patterns (build once, reuse)

- **Responsive list:** tables become card lists below `md`. Each card shows the 2 or 3 key facts and a status badge, whole card tappable. Real tables only from `md`.
- **Filters:** a "Filters" button opening a bottom sheet on mobile, inline row on desktop. Show active filter count.
- **Pagination:** "Load more" on mobile, pager on desktop. Never an unbounded list.
- **Forms:** single column, labels above fields, inline errors under the field in plain English, a sticky bottom action bar with the primary button, form state preserved on error.
- **Multi-step (sale):** stepper with progress, running total in a sticky footer, each step fits one screen on 360 x 640.
- **Dialogs:** bottom sheets on mobile, centred dialogs on desktop. Destructive actions need an explicit confirm with the serial or reference typed or shown.
- **States:** every screen has skeleton loading, empty (with next action), error (with retry) and success states. Toasts for non-blocking feedback only.
- **Badges:** one component, fixed mapping from status to colour + icon + label.

## 6. Check-in screens (most important)

- Scanner is full-bleed: camera fills the viewport under a slim dark app bar. Gate name and connection status always visible.
- Result takes over the whole screen until dismissed or auto-cleared:
  - **Admitted:** bright success colour, large check icon, "VALID — ADMITTED", category, serial, time. Short vibration.
  - **Rejected:** distinct colour per family (red invalid/revoked/used, amber not paid / not yet valid / closed), large icon, one-line reason, the original check-in time and gate for duplicates. Never green, never the word "admitted".
- Offline: sticky full-width banner "OFFLINE — CHECK-IN UNAVAILABLE" and the scan button disabled. Driven by a server heartbeat, not only `navigator.onLine`.
- Manual entry: big serial input, uppercase, no autocorrect, clear button, explicit Confirm button.
- Result text is announced with `aria-live="assertive"`.

## 7. Event poster and branding

- Admin uploads one poster (and optionally a logo) per event. JPEG, PNG or WebP only, 5 MB max. **No SVG.** Required alt text.
- The server validates real file type (magic bytes), strips metadata, re-encodes and stores resized variants (thumbnail about 480 px, display about 1200 px). Files live on a mounted volume outside `public/` and are served through a route with cache headers.
- Poster appears on: event detail header, admin and seller dashboard hero (compact), and a "Download poster" action. Never block a screen on the image: reserve its space (fixed aspect ratio), lazy-load, blur or colour placeholder.
- The ticket artwork stays stable at 210 x 59 mm. The poster is not forced onto the ticket.
- The upload volume must be added to backups.

## 8. Motion and feedback

- Subtle only: 150 to 200 ms transitions. Respect `prefers-reduced-motion`. No motion on the scanner except result feedback.
- Pressed states on every tappable element. Visible keyboard focus everywhere (gold ring on dark, brand ring on light).

## 9. PWA

- Installable: web manifest, maskable icons (192, 512), `theme_color` matching the app bar, `display: standalone`.
- A service worker may cache static assets only. It must never cache API responses, auth, tickets, QR tokens or scan results. No offline admission.

## 10. Definition of done for any screen

Checked at 360 x 800, 390 x 844, 768 x 1024 and 1280 x 800: no horizontal scroll, all tap targets 44 px or more, text 16 px or more, AA contrast, loading/empty/error states present, works with one hand, keyboard focus visible, no layout shift when images or data load, typecheck, lint and tests pass.
