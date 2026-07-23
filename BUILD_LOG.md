# Overnight build log — Phase 3 (M0–M3)

Branch: `build/overnight` off `main`. Autonomous, unattended run. **Nothing is merged** — the morning PR is the review gate.

## How this was run
- Orchestrator dispatches one fresh sub-agent per task with only that task's context (its Phase 3 row, files/areas, guideline IDs). Tasks stack sequentially on `build/overnight` because commits compose and the branch must never go red.
- Each task: smallest change meeting acceptance criteria → self-validate `npm run verify` → commit `<id>: <summary>` → log outcome here. Behavior-changing tasks (T1.5, T1.6, all M3) are built anyway per the overnight autonomy directive, each clearly labeled with risk notes; the PR is the sign-off gate.
- Safety: verify runs against a **local sqlite file only** (never `TURSO_*`, never `npm run seed` on shared Turso). Never merged/pushed to `main`; never force-pushed; never changed git identity.

## `npm run verify` = the gate
`typecheck` (tsc --noEmit) + `lint` (eslint) + `format:check` (prettier) + `test:unit` (vitest) + `test:e2e` (Playwright, seeded local DB, Strava mocked) + `deadcode` (knip) + `cycles` (madge).

## Status legend
DONE = committed, verify green · SKIPPED = intentionally not done (reason) · BLOCKED = attempted, could not reach green (reason) · PENDING = not yet reached.

---

## Task outcomes

| ID | Task | Status | Commit | verify | Notes |
|---|---|---|---|---|---|
| — | Branch + plan docs (`ASSESSMENT.md`, `BUILD_PROMPT.md`, `BUILD_LOG.md`) | DONE | `934b8f1` | n/a | Base of `build/overnight`. |
| T0.3 | typecheck script (`tsc --noEmit`) | DONE | `537a96d` | green | Baseline was already clean. |
| T0.4 | Prettier + format the tree | DONE | `46da247` | green | `printWidth 100`, `trailingComma es5`; markdown docs excluded to keep diff code-only; 47 files reformatted, no logic change. |
| T0.1 + T0.7 | vitest + pure-engine unit tests | DONE | `eccea90` | green | 37 tests: `computeLoad` method priority + Jundiaí HM ≈152.7 TSS (IF≈0.964, pace), `computePmc` EWMA, `formState` bands, `hrZones`/`paceZones`, `raceCategory`, splits validation, pace/date format. Alias `@`→src via manual resolve. |
| T0.5 | Knip + madge | DONE | `3824635` | green | `deadcode`/`cycles` exit 0. madge given `--ts-config` so it actually follows `@/…` alias imports (the bare command skipped 63 files). knip: next+vitest plugins, `ignoreExportsUsedInFile`, scoped ignores documented; no code removed, no check weakened. |
| T0.6 | Compose `verify` + GitHub Actions | DONE | `cf1320c` | green | `verify` = typecheck+lint+format:check+test:unit+deadcode+cycles (e2e appended in T0.2). CI workflow runs `verify` on PRs to `main`. |
| T0.2 | Playwright E2E + seeded local DB + Strava out of loop | DONE | `2bf8d78` | green | Chromium project vs isolated `data/e2e.db` (never TURSO), seeded via existing seed path; blank Strava creds so no external calls. `db.ts` gains a local-only `DATABASE_URL` override (unset in dev/prod → default path byte-identical). 6 e2e specs (log, review, fitness, gear). `test:e2e` folded into `verify`; CI installs chromium. |

| T1.1 | Identity seam (`currentAthlete`/`requireAthlete`) | DONE | `4649de2` | green | New `src/lib/identity.ts` is the single source of the owner id; `db.ts` sources the `strava_auth`/`athlete_thresholds` owner id from it (reads via `currentAthlete()`, writes via `requireAthlete()` — the future auth chokepoint). Behavior-preserving (resolves to id 1); no `athlete_id` columns; `CHECK (id=1)` schema untouched. |

| T1.2 | Telemetry seam + fix silent catches | DONE | _(this commit)_ | green | New `src/lib/telemetry.ts`: `logger` (structured console → captured by Vercel Observability) + `track()` no-op stub (usage analytics deferred behind the seam). The 6 bare `catch {}` in `strava.ts` now log through the seam before returning their unchanged fallback (behavior-preserving). `storage.ts` left untouched: it has no silent catches in the current tree (assessment claim was stale) — adding one would have introduced a new swallow. One silent catch remains in `db.ts` (out of scope). |

| T1.4 | Move personal/baseline data out of `db.ts` | DONE | _(this commit)_ | green | New `src/lib/baseline.ts` holds `BASELINE_SHOES`/`BASELINE_BIKES`/`THRESHOLD_DEFAULTS` (the sole owner's fixtures); `db.ts` imports them. Also deduped the threshold defaults so the `athlete_thresholds` seed INSERT sources from `THRESHOLD_DEFAULTS` instead of duplicated inline literals (G5.8). Seeded rows byte-identical; migration still auto-seeds on first run (behavior-preserving). |

| T1.3 | Speed Insights | DONE | _(this commit)_ | green | Added `@vercel/speed-insights` (runtime dep, first-party) and rendered `<SpeedInsights />` in the root layout. Web Analytics stays deferred behind the telemetry `track()` seam (documented, not wired). No-op off-Vercel so e2e unaffected. |

| T1.5 | Split dev/prod databases (guard + docs) | DONE (SIGN-OFF) | _(this commit)_ | green | **Behavior-changing, labeled.** `scripts/seed.ts` + `scripts/backfill-load.ts` now REFUSE to run against any non-`file:` (remote/Turso) DB by default (`ALLOW_REMOTE_DB=1` or `--force` overrides), protecting the shared prod DB. `.env.example`/README document the dev(local `data/app.db`)↔prod(Turso) split. `makeClient()` resolution unchanged. Local + e2e file DBs unaffected. **Risk:** any existing workflow that intentionally seeds/backfills prod must now pass `ALLOW_REMOTE_DB=1`. Fully reversible (revert the two scripts). |
| T1.6 | Auth boundary | PENDING | — | — | Deliberately LAST (after M2 + M3), per the leverage order. Minimal single-owner first cut. |

| T2.5 | `none` sentinel → one named constant | DONE | _(this commit)_ | green | New `src/lib/constants.ts` `export const NONE = "none"`; imported at all sites (`bike-select`, `settings-forms`, `bike-dialog`, `shoe-dialog`, and the matching server reads in `actions.ts`). Value byte-identical → behavior-preserving. Unrelated `"none"` (SVG/CSS) untouched. |

**M1 seams checkpoint:** full `npm run verify` (incl. 6 Playwright e2e) re-run by the orchestrator after T1.1–T1.5 — green.

**M0 acceptance met:** `npm run verify` is green on `build/overnight` (independently re-run by the orchestrator, exit 0, incl. 6 Playwright specs), runs against a local sqlite file only, and CI is wired to run it on every PR.

### Discovered during M0 (not in the backlog — flag for later)
- **libSQL `Row` objects reach client components.** `next dev` logs "Only plain objects can be passed to Client Components from Server Components" for `ShoeCard`/`BikeCard` and split rows — libSQL returns non-plain `Row` objects that the db layer passes straight through to `"use client"` components. Pre-existing, non-blocking (tests pass), but a real serialization-boundary smell. Candidate for the db-seam decode work (relates to G3.6 / T3.12). Fixing means mapping rows to plain objects at the `db.ts` seam.
- **Stale dev server killed.** A leftover training-hub `next dev` (running ~32h, holding Next 16's single-instance dev lock on :3001) blocked the e2e webServer and was terminated. The unrelated `betterfit` dev server (:3000) was left running.
