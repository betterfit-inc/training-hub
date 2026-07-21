import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { UPLOADS_DIR } from "./db";

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Vercel Blob is used when its token is present; otherwise photos stay on disk. */
export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Stores a shoe photo and returns the value to keep in shoes.photo_path:
 * a full URL when stored in Vercel Blob, or a bare filename for local disk.
 */
export async function storePhoto(file: File): Promise<string> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error("Photo must be a JPEG, PNG, WebP, AVIF or GIF image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large (8 MB max).");
  const name = `shoe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

  if (blobEnabled()) {
    const blob = await put(name, file, { access: "public" });
    return blob.url;
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

/**
 * Resolves a stored photo_path to an <img> src. Bare filenames are served by
 * the local uploads route; they are unreachable on Vercel, so the card falls
 * back to the placeholder until the photo is re-uploaded there.
 */
export function photoSrc(photoPath: string | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith("http")) return photoPath;
  if (blobEnabled()) return null;
  return `/api/uploads/${encodeURIComponent(photoPath)}`;
}
