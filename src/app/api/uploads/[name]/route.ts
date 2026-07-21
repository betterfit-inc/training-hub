import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { UPLOADS_DIR } from "@/lib/db";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const safeName = path.basename(name);
  const filePath = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const type = CONTENT_TYPES[path.extname(safeName).toLowerCase()];
  if (!type) {
    return new Response("Unsupported file type", { status: 415 });
  }
  const file = fs.readFileSync(filePath);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
