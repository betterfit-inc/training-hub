import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/lib/storage";

// T3.8 / G11.5: the upload path used to trust the client-provided `file.type`
// (MIME) with no server-side content check, so a non-image could be stored under
// a spoofed image MIME. `sniffImageType` reads the leading MAGIC NUMBERS and is
// the single source of truth for "is this really an image, and which one" — the
// declared MIME is never consulted. These tests pin that contract, including the
// spoof case (image MIME, text body) which must resolve to null.

/** Builds a Uint8Array from a list of byte values plus optional trailing pad. */
function bytesOf(prefix: number[], padTo = 0): Uint8Array {
  const out = new Uint8Array(Math.max(prefix.length, padTo));
  out.set(prefix);
  return out;
}

describe("sniffImageType", () => {
  it("detects a PNG by its 8-byte signature", () => {
    const png = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 16);
    expect(sniffImageType(png)).toBe("image/png");
  });

  it("detects a JPEG by FF D8 FF", () => {
    const jpeg = bytesOf([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46], 16);
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
  });

  it("detects a WebP by RIFF....WEBP", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    const webp = bytesOf(
      [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      16
    );
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("detects a GIF by GIF8", () => {
    // "GIF89a"
    const gif = bytesOf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 16);
    expect(sniffImageType(gif)).toBe("image/gif");
  });

  it("detects an AVIF by its ftyp box brand", () => {
    // box size, "ftyp", major brand "avif"
    const avif = bytesOf(
      [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
      24
    );
    expect(sniffImageType(avif)).toBe("image/avif");
  });

  it("returns null for a plain text (non-image) buffer", () => {
    const text = new TextEncoder().encode("Just some text, definitely not an image.");
    expect(sniffImageType(text)).toBeNull();
  });

  it("returns null for a text payload that a client falsely labels image/png (spoof)", () => {
    // The sniff never sees the client MIME — content is the sole authority. A
    // script/HTML/text body uploaded as image/png must still resolve to null.
    const spoof = new TextEncoder().encode("<html>not a png</html>");
    expect(sniffImageType(spoof)).toBeNull();
  });

  it("returns null for a truncated / partial magic number", () => {
    // First two PNG bytes only — not enough to be a real PNG.
    expect(sniffImageType(bytesOf([0x89, 0x50]))).toBeNull();
    // "RIFF" without the "WEBP" fourcc is some other RIFF container, not WebP.
    const riffNotWebp = bytesOf(
      [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20],
      16
    );
    expect(sniffImageType(riffNotWebp)).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
