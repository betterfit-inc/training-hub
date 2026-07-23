import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string equality for secrets/tokens (e.g. the OAuth `state`).
 *
 * G11.4 (T3.9): a plain `a === b` on a CSRF token is a minor timing side-channel
 * because it bails at the first differing character. This routes the comparison
 * through node:crypto `timingSafeEqual`, which does not short-circuit.
 *
 * `timingSafeEqual` throws when the two buffers differ in byte length, so the
 * length is guarded up front and a mismatch returns false instead of throwing.
 * (The length check itself is not constant-time, but the OAuth state is a
 * fixed-length token, and revealing only "wrong length" leaks nothing useful.)
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
