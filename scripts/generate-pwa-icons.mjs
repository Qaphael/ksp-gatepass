import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(root, "public/icons/ksp-gatepass-placeholder.svg");
const iconDirectory = path.join(root, "public/icons");
const appDirectory = path.join(root, "src/app");
const svg = await readFile(sourcePath);

await mkdir(iconDirectory, { recursive: true });
await Promise.all([
  sharp(svg).resize(192, 192).png().toFile(path.join(iconDirectory, "ksp-gatepass-192.png")),
  sharp(svg).resize(512, 512).png().toFile(path.join(iconDirectory, "ksp-gatepass-512.png")),
  sharp(svg).resize(180, 180).png().toFile(path.join(appDirectory, "apple-icon.png")),
]);
