// Regenerates the PWA / app icons from the editable SVG sources in public/brand/source.
// Run:  node scripts/generate-pwa-icons.mjs
// (favicon.ico is not produced here: sharp cannot write ICO. See docs/BRAND.md.)
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "public/brand/source");
const iconDir = path.join(root, "public/icons");
const appDir = path.join(root, "src/app");

const jobs = [
  ["app-icon-any.svg", path.join(iconDir, "icon-192.png"), 192],
  ["app-icon-any.svg", path.join(iconDir, "icon-512.png"), 512],
  ["app-icon-maskable.svg", path.join(iconDir, "icon-maskable-192.png"), 192],
  ["app-icon-maskable.svg", path.join(iconDir, "icon-maskable-512.png"), 512],
  ["app-icon-monochrome.svg", path.join(iconDir, "icon-monochrome-512.png"), 512],
  ["app-icon-apple.svg", path.join(appDir, "apple-icon.png"), 180],
];

await mkdir(iconDir, { recursive: true });
await Promise.all(
  jobs.map(async ([source, target, size]) => {
    const svg = await readFile(path.join(sourceDir, source));
    // Render the SVG at the target size directly (density scales the vector), then write PNG.
    await sharp(svg, { density: (72 * size) / 512 }).resize(size, size).png().toFile(target);
    console.log(`${path.relative(root, target)} (${size}x${size})`);
  }),
);
