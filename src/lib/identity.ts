// The identity seam.
//
// Single job: resolve/authorize the current athlete. Today the app has a sole
// owner — the `id = 1` singleton row behind `strava_auth` / `athlete_thresholds`
// (their `CHECK (id = 1)` constraint pins it) — so this resolves to that owner.
// It is the ONE place a future multi-tenant / auth change plugs in: change the
// body here and every owner-scoped read and write follows, with no scattered
// `1` literals to hunt down.

/** The athlete whose data the app is acting on. Today just the owner's id. */
export interface Athlete {
  id: number;
}

// The sole owner today: the `id = 1` singleton row in strava_auth /
// athlete_thresholds. This constant is the single source of "which id is the
// owner"; nothing else should hardcode it.
const OWNER: Athlete = { id: 1 };

/** Who is the current athlete? Today: always the sole owner. */
export function currentAthlete(): Athlete {
  return OWNER;
}

/**
 * The authorization chokepoint for owner-scoped work: resolve the current
 * athlete and (later) assert they are allowed to act. Today there is one owner
 * and no session, so it simply returns that owner. T1.6 (auth) extends this to
 * read the session and throw / redirect when there is no authorized athlete —
 * without touching any of its call sites.
 */
export function requireAthlete(): Athlete {
  return currentAthlete();
}
