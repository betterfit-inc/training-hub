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

/**
 * Vercel Blob is used when its credentials are present; otherwise photos stay
 * on disk. Locally that is BLOB_READ_WRITE_TOKEN; on Vercel a dashboard-connected
 * store may inject only BLOB_STORE_ID and authenticate through the OIDC token.
 */
export function blobEnabled(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * Stores a shoe photo and returns the filename to keep in shoes.photo_path.
 * With a Blob token the file goes to the (private) Vercel Blob store, else to
 * data/uploads/. Either way the uploads route serves it by that filename.
 */
export async function storePhoto(file: File): Promise<string> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error("Photo must be a JPEG, PNG, WebP, AVIF or GIF image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large (8 MB max).");
  const name = `shoe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

  if (blobEnabled()) {
    const blob = await put(name, file, { access: "private", contentType: file.type });
    return blob.pathname;
  }

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

/** Resolves a stored photo_path to an <img> src served by the uploads route. */
export function photoSrc(photoPath: string | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith("http")) return photoPath;
  return `/api/uploads/${encodeURIComponent(photoPath)}`;
}
