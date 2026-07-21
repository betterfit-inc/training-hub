import fs from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { UPLOADS_DIR } from "@/lib/db";
import { blobEnabled } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
};

/** Serves shoe photos: local data/uploads first, then the private Blob store. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const safeName = path.basename(name);
  const type = CONTENT_TYPES[path.extname(safeName).toLowerCase()];
  if (!type) {
    return new Response("Unsupported file type", { status: 415 });
  }

  const filePath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(filePath)) {
    const file = fs.readFileSync(filePath);
    return new Response(new Uint8Array(file), {
      headers: { "Content-Type": type, ...CACHE_HEADERS },
    });
  }

  let reason = "blob-disabled";
  if (blobEnabled()) {
    try {
      const result = await get(safeName, { access: "private" });
      if (result && result.statusCode === 200) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || type,
            ...CACHE_HEADERS,
          },
        });
      }
      reason = "blob-miss";
    } catch (error) {
      reason = "blob-error";
      console.error("uploads route blob error:", error);
    }
  }

  return new Response("Not found", { status: 404, headers: { "x-uploads": reason } });
}
