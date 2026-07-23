// The result contract every server action returns, plus the safe constructor for
// its failure variant. Lives outside the "use server" module (actions.ts) so it
// can export plain (non-async) helpers and be unit-tested in isolation.
import { logger } from "./telemetry";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Builds a failure result for a caught error (G6.3).
 *
 * The raw `error` is logged through the telemetry seam so internal/DB exception
 * text stays observable server-side, and the caller's CONTROLLED, localized
 * `fallback` (a `t.errors.*` message) is what reaches the client. It never
 * returns `error.message` verbatim — the UI renders `result.error` directly
 * (toast.error), so surfacing raw exception text would leak internal detail.
 * The caller's specific fallback is passed through unchanged, so a deliberately
 * specific message (e.g. `t.errors.syncFailed`) is not genericized.
 */
export function fail(error: unknown, fallback: string): { ok: false; error: string } {
  logger.error("actions.fail", { error });
  return { ok: false, error: fallback };
}
