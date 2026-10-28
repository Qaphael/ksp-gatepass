import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const SAFE_KEY = /^[A-Za-z0-9_-]{32}(?:-thumbnail|-display)?\.webp$/;

export function brandingStorageRoot(): string {
  const configured = process.env.BRANDING_STORAGE_DIR?.trim();
  const root = path.resolve(/* turbopackIgnore: true */ configured || path.join(process.cwd(), ".data", "event-branding"));
  const publicRoot = path.resolve(process.cwd(), "public");
  const relative = path.relative(publicRoot, root);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("BRANDING_STORAGE_DIR must be outside the public directory.");
  }
  return root;
}

export async function ensureBrandingStorage(): Promise<string> {
  const root = brandingStorageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

export function brandingFilePath(root: string, key: string): string {
  if (!SAFE_KEY.test(key)) throw new Error("Invalid branding storage key.");
  return path.join(root, key);
}

export async function writeBrandingFile(root: string, key: string, data: Buffer): Promise<void> {
  await writeFile(/* turbopackIgnore: true */ brandingFilePath(root, key), data, { flag: "wx", mode: 0o600 });
}

export async function readBrandingFile(key: string): Promise<Buffer> {
  const root = await ensureBrandingStorage();
  return readFile(/* turbopackIgnore: true */ brandingFilePath(root, key));
}

export async function removeBrandingFiles(keys: Array<string | null | undefined>): Promise<void> {
  const root = await ensureBrandingStorage();
  await Promise.all(keys.filter((key): key is string => Boolean(key)).map(async (key) => {
    try { await unlink(/* turbopackIgnore: true */ brandingFilePath(root, key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }));
}
