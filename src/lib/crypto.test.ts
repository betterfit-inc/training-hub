import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "@/lib/crypto";

// G11.4 (T3.9): the OAuth `state` check compared the incoming state against the
// cookie with `state !== expected`, a non-constant-time string comparison and a
// minor timing side-channel on a CSRF token. constantTimeEqual routes the check
// through node:crypto timingSafeEqual, which needs equal-length buffers or it
// throws, so the helper guards the length itself and returns false (never
// throws) on a mismatch. These tests pin the functional contract; the timing
// property is provided by timingSafeEqual.
describe("constantTimeEqual", () => {
  it("returns true for equal strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("f3a9c0d1e2b4a5c6", "f3a9c0d1e2b4a5c6")).toBe(true);
  });

  it("returns false for differing strings of equal length", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("aaaaaa", "aaaaab")).toBe(false);
  });

  it("returns false (never throws) for different-length strings", () => {
    // timingSafeEqual throws "Input buffers must have the same byte length" on a
    // length mismatch; the helper must catch that by guarding length up front.
    expect(() => constantTimeEqual("abc", "abcd")).not.toThrow();
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("longer-string", "short")).toBe(false);
  });

  it("handles empty and edge cases sanely", () => {
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("x", "")).toBe(false);
  });

  it("compares by bytes, so multi-byte differences of unequal byte length are false", () => {
    // "é" is 2 bytes in UTF-8, "e" is 1 byte: different byte length -> false, no throw.
    expect(constantTimeEqual("é", "e")).toBe(false);
    expect(constantTimeEqual("café", "café")).toBe(true);
  });
});
