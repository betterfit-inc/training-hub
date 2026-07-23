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

| T2.10 | Remove drift/dead code + rename misleading key | DONE (partial) | _(this commit)_ | green | Removed: `ui/select` dead `&& ""` popper branch, `insights` redundant `activeDays` init, `ui/tooltip` dangling `data-[slot=kbd]` refs, `ui/dialog` `DialogFooter` dead Close button (`showCloseButton` was always false → never rendered). Renamed `review-flow` `keyApi.rpe` → `patchForm` (it stored the patch callback). **Skipped item:** `streams.ts` `?? new Array(n).fill(null)` — verified LIVE (indoor/manual activities lack distance/time streams; removing breaks types + activity-chart). Assessment's "unreachable" flag was wrong. |

| T2.4 | Name magic numbers | DONE | _(this commit)_ | green | `fitness.ts`: `TSS_SCALE=100`, `SECONDS_PER_HOUR/MINUTE`, `RPE_TSS_FACTOR=0.25`, `TSB_FRESH_ABOVE/NEUTRAL_FLOOR/PRODUCTIVE_FLOOR`. `db.ts`: `DEFAULT_RETIREMENT_KM=700` (DDL interpolates it), `WRITE_CHUNK=200`. `races.ts`: named distance-band boundaries with shared edges. Values identical; engine tests unchanged and green. |

| T2.7 | Migration versioning (`schema_version` + ordered registry) | DONE | _(this commit)_ | green | Replaced the `pragma_table_info`-inferred applied-state with an ordered `MIGRATIONS` registry (versions 1–5, sequential, matching execution order) tracked by a single-row `schema_version` table. Every step idempotent (`CREATE TABLE IF NOT EXISTS`, guarded ADD COLUMN, empty-only seed). Verified schema+seed equivalence against a **copy** of the real 1229-activity `data/app.db` (original never mutated) — identical except the intended `schema_version` addition; idempotent re-run leaves zero duplication. No `PRAGMA foreign_keys` (that's T3.1). |

| T2.3 | Dedup `db.ts` | DONE | _(this commit)_ | green | Load-upsert 3→1 via `activityLoadUpsert({source, overrideManual})` — the divergent auto/manual/override semantics preserved as one parameterized template (verified SQL-equivalent). Gear-uniqueness UPDATE 6→1 via `clearGearFromOthers(table, gearId, exceptId?)`. Split-delete literal → one constant. All exported signatures + bound params unchanged; behavior-preserving. |

| T2.11 | Query efficiency | DONE | _(this commit)_ | green | `attachSplits` now filters `WHERE activity_id IN (…)` (no whole-table scan); `BIKE_SELECT` computes mileage once via a `GROUP BY` aggregate join (was 4×/row); `recomputeAllLoads` fetches `raw_json` only for ride sports (blob skipped for runs/others — proven identical via 10-case `computeLoad` diff, since only the ride-gated power branch reads it); `countPending` wrapped in React `cache()` so `layout` + `page` share one query per request. All outputs proven byte-identical. |

| T2.9 | i18n tidy | DONE | _(this commit)_ | green | Replaced 7 of 9 `as Record<>` casts with `satisfies Record<Union,string>` (restores key-checking; parity mechanism intact/stronger); 2 kept (runtime numeric/arbitrary-string indexes, justified). `createManualActivityAction` now uses `t.errors.*` (added `zeroDistance`/`pickShoe` to en+pt). `sports.ts` hardcoded labels + `categoryLabel()` were dead duplicates (display already routes through `t.sports`) → removed; dict is now the single label source. No visible change (PT strings already existed). Also narrowed `method` types to `LoadMethod`. |

| T2.8 | Repo module map + form paradigm | DONE | _(this commit)_ | green | Added `MAP.md` (entry points, per-module one-liners incl. the new `identity`/`telemetry`/`baseline`/`constants` seams, main flows, conventions). Form paradigm (G14.1) is **documented** rather than force-converted: `<form action>`+FormData is the default; the two controlled forms (`ThresholdsForm`/`ManualActivityForm`) keep `useState` because they need live per-keystroke formatting/validation — converting them would break that UX. Doc-only; gate unaffected. |

| T3.1 | Enable FK enforcement | DONE (SIGN-OFF) | _(this commit)_ | green | **Behavior-changing, labeled.** Regression guard `db.fk.test.ts` (isolated temp `file:` DB) asserts deleting an activity leaves zero orphaned splits/streams/load/chat rows. Fix: explicit one-shot `PRAGMA foreign_keys = ON` on the local path in `migrate()`. **Finding:** the local `@libsql/client` build already defaults FK ON per connection (verified via a forced-OFF probe → orphans), so there was no live local bug; the PRAGMA makes G5.5 explicit. **Remote caveat:** Turso HTTP is stateless per request → FK must be enforced server-side there (documented in code). Simplified from an initial per-connection Proxy wrapper down to the one-shot (leanest solution). |

| T3.3 | Power-TSS gates on real device power | DONE (SIGN-OFF) | _(this commit)_ | green | **Behavior-changing, labeled. Assessment risk #3 (corrupts computed load), corroborated by tonight's fitness research.** `computeLoad`'s power branch now fires only when `rideMetrics().hasRealPower` (`device_watts === true`); estimated Strava wattage falls through to HR. Regression test proven red pre-fix (`expected 'power' not to be 'power'`), green post-fix; real-power ride still → `power`, estimated → `hr`. **Risk:** historical rides with estimated power flip power-TSS → HR-TSS; recomputing loads would shift their CTL/ATL/TSB (intended correction). No mass recompute triggered. |

**M1 seams checkpoint:** full `npm run verify` (incl. 6 Playwright e2e) re-run by the orchestrator after T1.1–T1.5 — green.

**M0 acceptance met:** `npm run verify` is green on `build/overnight` (independently re-run by the orchestrator, exit 0, incl. 6 Playwright specs), runs against a local sqlite file only, and CI is wired to run it on every PR.

### Discovered during M0 (not in the backlog — flag for later)
- **libSQL `Row` objects reach client components.** `next dev` logs "Only plain objects can be passed to Client Components from Server Components" for `ShoeCard`/`BikeCard` and split rows — libSQL returns non-plain `Row` objects that the db layer passes straight through to `"use client"` components. Pre-existing, non-blocking (tests pass), but a real serialization-boundary smell. Candidate for the db-seam decode work (relates to G3.6 / T3.12). Fixing means mapping rows to plain objects at the `db.ts` seam.
- **Stale dev server killed.** A leftover training-hub `next dev` (running ~32h, holding Next 16's single-instance dev lock on :3001) blocked the e2e webServer and was terminated. The unrelated `betterfit` dev server (:3000) was left running.
