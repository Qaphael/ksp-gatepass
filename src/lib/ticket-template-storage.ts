import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandingStorageRoot } from "@/lib/event-branding-storage";

const SAFE_ARTWORK_KEY = /^[A-Za-z0-9_-]{32}\.(?:png|jpg)$/;

export function ticketTemplateArtworkPath(root: string, key: string): string {
  if (!SAFE_ARTWORK_KEY.test(key)) throw new Error("Invalid ticket artwork key.");
  return path.join(root, key);
}

export async function ensureTicketTemplateStorage(): Promise<string> {
  const root = brandingStorageRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

export async function writeTicketTemplateArtwork(root: string, key: string, data: Buffer): Promise<void> {
  await writeFile(ticketTemplateArtworkPath(root, key), data, { flag: "wx", mode: 0o600 });
}

export async function readTicketTemplateArtwork(key: string): Promise<Buffer> {
  const root = await ensureTicketTemplateStorage();
  return readFile(ticketTemplateArtworkPath(root, key));
}

export async function removeTicketTemplateArtwork(keys: Array<string | null | undefined>): Promise<void> {
  const root = await ensureTicketTemplateStorage();
  await Promise.all(keys.filter((key): key is string => Boolean(key)).map(async (key) => {
    try { await unlink(ticketTemplateArtworkPath(root, key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }));
}
