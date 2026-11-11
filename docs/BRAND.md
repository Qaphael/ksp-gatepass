# KSP GatePass brand mark

The mark is two shapes (a trapezoid and a notched block) on a 100-unit grid, corner radius 4. Colour comes from the design tokens in `globals.css`, never hard-coded in components.

## Files

| File | Use |
| --- | --- |
| `public/brand/logo-mark.svg` | Ink mark, general use |
| `public/brand/logo-mark-brand.svg` | Brand green (#0f3d2e) on light backgrounds |
| `public/brand/logo-mark-white.svg` | Ivory (#faf7f0) on dark backgrounds |
| `public/brand/logo-mark-gold.svg` | Gold (#c8a24a) on brand-900 only |
| `public/brand/logo-mark-small.svg` | Wider gap, for sizes under 40 px |
| `public/brand/logo-mark-{black,brand,white}-{512,1024}.png` | Transparent PNGs for documents, slides, print mock-ups |
| `public/brand/alt/` | Other corner radii (sharp r0, soft r2, round r6.5) for comparison only. Do not ship. |
| `public/brand/source/app-icon-*.svg` | Editable sources for the app icons |
| `public/icons/icon-{192,512}.png` | Manifest "any" icons (rounded square) |
| `public/icons/icon-maskable-{192,512}.png` | Manifest "maskable" icons (full bleed, mark inside the safe zone) |
| `public/icons/icon-monochrome-512.png` | Manifest "monochrome" icon (Android themed icons) |
| `src/app/icon.svg`, `src/app/favicon.ico` | Browser tab icon (wider-gap variant on brand-900) |
| `src/app/apple-icon.png` | iOS home screen icon (opaque, 180 px) |
| `src/lib/brand/logo-mark.ts` | Path data, the single source for the React component and PDFs |
| `src/components/brand/logo-mark.tsx` | `LogoMark` and `BrandLockup` components |

## Rules

- **Clear space:** keep a margin around the mark of at least 25% of its width.
- **Minimum size:** 24 px on screen for the default mark. Under 40 px use `variant="small"`. In print, 8 mm.
- **Colours:** brand green on light, ivory on dark, gold only on brand-900. Never gradients, outlines, shadows or other colours. Never stretch, rotate or recolour the two shapes differently.
- **Backgrounds:** the mark needs 4.5:1 contrast with its background (3:1 is the floor for large decorative use). Brand green on ivory, ivory on brand-900 and gold on brand-900 all pass.
- **Radius:** do not change the corner radius per use. To change it for the whole brand, regenerate all assets from one geometry.
- **Event posters and event logos** uploaded per event are separate from this mark. Do not replace them with it.

## Regenerating

- App and PWA PNGs: `node scripts/generate-pwa-icons.mjs` (needs `sharp`, already a dependency). Edit the SVGs in `public/brand/source/` first.
- `favicon.ico` is not produced by that script. Export `public/brand/source/app-icon-favicon.svg` at 16, 32, 48 and 64 px and pack them into one ICO with any converter.
- If the mark changes, also update the path data in `src/lib/brand/logo-mark.ts` and the standalone SVGs in `public/brand/`.
