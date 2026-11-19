---
name: GatePass Dark Operational System
colors:
  surface: '#0e141a'
  surface-dim: '#0e141a'
  surface-bright: '#343a41'
  surface-container-lowest: '#090f15'
  surface-container-low: '#171c23'
  surface-container: '#1b2027'
  surface-container-high: '#252a32'
  surface-container-highest: '#30353d'
  on-surface: '#dee3ec'
  on-surface-variant: '#c6c5d5'
  inverse-surface: '#dee3ec'
  inverse-on-surface: '#2c3138'
  outline: '#908f9e'
  outline-variant: '#454652'
  surface-tint: '#bdc2ff'
  primary: '#bdc2ff'
  on-primary: '#121f8b'
  primary-container: '#5e6ad2'
  on-primary-container: '#fdfaff'
  inverse-primary: '#4854bb'
  secondary: '#4adf9d'
  on-secondary: '#003823'
  secondary-container: '#01ba7c'
  on-secondary-container: '#00432a'
  tertiary: '#ffba33'
  on-tertiary: '#422c00'
  tertiary-container: '#996b00'
  on-tertiary-container: '#fffaf8'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dfe0ff'
  primary-fixed-dim: '#bdc2ff'
  on-primary-fixed: '#000965'
  on-primary-fixed-variant: '#2e3aa2'
  secondary-fixed: '#6bfcb8'
  secondary-fixed-dim: '#4adf9d'
  on-secondary-fixed: '#002112'
  on-secondary-fixed-variant: '#005234'
  tertiary-fixed: '#ffdeab'
  tertiary-fixed-dim: '#ffba33'
  on-tertiary-fixed: '#281900'
  on-tertiary-fixed-variant: '#5f4100'
  background: '#0e141a'
  on-background: '#dee3ec'
  surface-variant: '#30353d'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a high-performance, dark-mode-first aesthetic engineered for ticket purchasing, real-time scanning, and gate management under demanding field conditions (varying glare, nighttime venues, low-bandwidth handheld environments). Drawing direct inspiration from modern engineering tools like Linear, the UI strips away superfluous decoration in favor of ultra-dense legibility, strict contrast standards, and instant optical clarity.

### Core Principles
- **Precision & Utility:** Every pixel serves operational certainty. Visual weight directly maps to state hierarchy and interactive consequence.
- **Controlled Density:** Mobile-first layout ergonomics optimized for single-thumb interactions, scanning speed, and queue throughput without visual noise.
- **Tactile Edge Hierarchy:** Zero blur skew or skeuomorphic depths; separation is achieved entirely via monochromatic surface tiers (#08090A against #0F1011) and crisp, hairline 1px borders.
- **Defensive Legibility:** Status indicators never rely purely on chromatic hues; iconography, high-contrast labels, and monospaced figures guarantee unambiguous real-time state assessment during active guest processing.

## Colors

The palette uses deep, near-black pitch tones as the foundation, allowing the deliberate purple-blue signature accent and functional semantic indicators to signal interactive priority and operational status without causing screen glare or visual exhaustion during night operations.

### Canvas & Surface Hierarchy
- **Canvas Base (`#08090A`):** The definitive void background applied to root containers, viewport frames, and non-surface regions.
- **Card & Elevated Layer (`#0F1011`):** Applied to tickets, scan zones, dialog modals, bottom sheets, and grouped data blocks.
- **Hairline Structural Borders (`#222529` / `#2B3036`):** Precision 1px division between surfaces. Use `#222529` for internal list dividers and resting containers; reserve `#2B3036` for interactive inputs, active focus rings, and high-priority card edges.

### Typography Colors
- **Foreground Primary (`#F7F8F8`):** Uncompromising high-contrast white for headings, quantitative values, ticket holder names, and active button text.
- **Foreground Muted (`#8A8F98`):** Mid-tone neutral for metadata labels, helper notes, timestamps, and resting state icons.

### Semantic Status Tokens
- **Success (`#00BA7C`):** Validated ticket scans, confirmed entry, completed UGX mobile transactions.
- **Warning (`#F7B32B`):** Partial check-ins, VIP holds, offline cache synchronization notices.
- **Danger (`#E5484D`):** Duplicate access attempts, invalidated QR codes, expired events, critical gate rejections.
- **Info / Interactive Accent (`#5E6AD2`):** Primary interactions, navigational focus, active step states, and general telemetry.

## Typography

The type system blends a refined geometric sans-serif (`Geist`) with a high-readability monospaced type (`JetBrains Mono`). 

### Rules of Usage
- **Monospaced Constraint:** All financial amounts (e.g., `UGX 50,000`), alphanumeric ticket serial numbers (e.g., `KSP-8821-X`), verification timestamps, and scanner countdown timers must strictly use `JetBrains Mono`. This eliminates horizontal jitter during dynamic value changes and permits rapid visual verification at the gate.
- **Headings & Body:** Headings utilize tight, negative letter-spacing for an authoritative, software-grade profile. Body text remains untracked to maximize optical legibility under varying ambient light conditions.
- **Case Conventions:** Status tags and table headers use uppercase monospaced labels (`label-mono-sm`) with positive letter-spacing (`0.03em`) to deliver distinct optical separation from user-entered body text.

## Layout & Spacing

The system is calibrated around a strict 8-point structural rhythm (`0.5rem` = 8px) with a 4-point micro-step (`0.25rem` = 4px) reserved exclusively for internal component padding, inline icon spacing, and tag borders.

### Layout Principles
- **Touch Target Integrity:** All interactive elements—including scan triggers, counter incrementors, filters, and list items—must uphold a mandatory minimum touch target bounding box of 44px (recommended 48px on handheld scan screens).
- **Mobile-First Single Column:** The core viewport is clamped to 100% width on phone screens with a strict outer margin of `1rem` (16px). For administrative gate tablets or desktop management views, layouts transition into a constrained fluid grid with maximum container widths (`768px` for focused scan terminals; `1200px` for multi-gate dispatch boards).
- **Fixed Operational Zones:** Primary actions (such as "Initiate Scan", "Complete Payment", or "Override Pass") stick to the bottom safe-area anchor on mobile displays, insulated by an elevated backdrop with an explicit top border (`1px solid #222529`).

## Elevation & Depth

This design system avoids soft dropshadows, blurred backdrops, and artificial vertical elevations. Depth is governed strictly through surface color contrast and sharp perimeter definition.

### Layer Architecture
- **Base Canvas (Level 0):** `#08090A` — The ultimate viewport background.
- **Surface Tiles (Level 1):** `#0F1011` — Used for cards, action sheets, list item rows, and scanner frames. Each Level 1 container is enclosed by a mandatory `1px solid #222529` stroke.
- **Active / Overlaid Surfaces (Level 2):** `#16181A` with a `1px solid #2B3036` stroke — Used for dropdown menus, contextual confirmation popovers, and sticky footer sheets.
- **Focus & Selection Indication:** When an element is selected or focused, elevate its stroke to `1px solid #5E6AD2`. Never use multi-layer glowing or outer-ring spread shadows.

## Shapes

The design system enforces an uncompromising ban on organic curves, circular buttons, and pill badges. The visual aesthetic reflects a technical, machine-grade tool.

### Geometry Specifications
- **Base Corner Radius:** `0.375rem` (6px) or `0.5rem` (8px). 
- **Buttons, Inputs, Badges, & Chips:** Standardized to a uniform `rounded-md` (6px) geometry.
- **Surfaces, Modals, & Cards:** Standardized to `8px` (`rounded-lg`) geometry to maintain proportional harmony against smaller nested child controls.
- **Strict Prohibition:** Full circular radii are prohibited for functional controls; avatars and icon buttons must conform to squircle boundaries (6px or 8px corner radii).

## Components

### Buttons
- **Height & Bounds:** Minimum height of 48px for primary actions; 40px for secondary utility buttons. Always `rounded-md` (6px).
- **Primary:** Background `#5E6AD2`, foreground `#F7F8F8`, font weight 500. Active state: `#4D58B8`.
- **Secondary / Surface:** Background `#0F1011`, border `1px solid #2B3036`, foreground `#F7F8F8`. Hover/Touch down: Background `#16181A`.
- **Destructive:** Background `transparent`, border `1px solid #E5484D`, foreground `#E5484D`.

### Status Badges & Chips
- **Geometry:** `rounded-md` (6px), compact vertical padding (2px to 4px), horizontal padding (8px).
- **Pairing Rule:** A status indicator must *never* rely solely on color. Every badge must contain both a vector status icon (14px) and a bold, monospaced text label.
- **Styles:** Low-opacity tinted background (e.g., `#00BA7C` at 10% opacity), paired with solid stroke (1px at 30% semantic opacity) and high-contrast text label (`#F7F8F8` or full semantic color).

### Input Fields & Verification Controls
- **Structure:** Height 48px, background `#0F1011`, border `1px solid #2B3036`, text `#F7F8F8`, font `Geist` for standard text and `JetBrains Mono` for redemption codes and amounts.
- **Active Focus:** Border transitions instantly to `1px solid #5E6AD2`. No drop shadow.
- **Leading / Trailing Affordances:** Icon indicators and fixed currency identifiers (e.g., `UGX`) locked to `#8A8F98`.

### Gate Scan Cards & Result Panels
- **Anatomy:** Card surface `#0F1011`, bordered by `1px solid #222529`. 
- **Verification Feedback State:** Invalidation triggers a full-border change to `1px solid #E5484D` with an alert icon and explicit text reading `INVALID / ALREADY CHECKED IN`. Success triggers `1px solid #00BA7C` accompanied by check icon, guest tier tag, and entry timestamp in `JetBrains Mono`.

### Lists & Row Groups
- **Structure:** Divided by `1px solid #222529`. Row height min 56px to ensure rapid thumb scanning and single-tap selection during ticket sales.
- **Layout:** Title and timestamp aligned left; price and state badge aligned right.