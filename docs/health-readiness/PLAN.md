# Handoff prompt: source-agnostic Health, Readiness & Recovery layer

Paste this into a fresh Claude Code session in the `training-hub` repo. It is the implementation brief for a feature planned in a prior session. Two research documents in this same folder are required reading and contain the granular contracts:
- `RESEARCH_GARMIN_LIBS.md` — Garmin library choice, auth reality, exact field/endpoint names per metric, a runnable Python sync sketch, and the app-side ingest JSON contract.
- `RESEARCH_COROS_AND_READINESS.md` — Coros access options, Garmin↔Coros↔generic metric mapping, and a concrete 0-100 readiness model with per-component formulas, default weights, bands, red-flag overrides, and graceful degradation.

Also orient with `ASSESSMENT.md` and `MAP.md` at the repo root, and remember `AGENTS.md`: this is a modified Next.js 16 — consult `node_modules/next/dist/docs/` before using framework features (route handlers, `after`, cron, etc.).

---

## 0. Working mode — AUTONOMOUS, do NOT ask the owner questions

The owner starts you and leaves (they have an appointment). Work start-to-finish WITHOUT asking them anything. When a choice arises (which metric to include, a weight, a UI placement, a name), pick the most sensible default consistent with this plan + the codebase conventions, implement it, and record the decision (with a one-line rationale) and any genuine open question in a `BUILD_LOG.md` on your branch and in the PR description. Do not block, do not wait, do not ask. The PR is the review gate.

- Work on a new branch `feature/health-readiness` off `main`. Never commit to `main` directly. Open exactly ONE PR to `main` at the end.
- Keep the branch green: after each cohesive step, `npm run verify` must pass (typecheck+lint+format+vitest[node+jsdom]+knip+madge+playwright). Commit in small, self-validated steps. Never leave it red; if a step can't go green after honest effort, revert it and note it in `BUILD_LOG.md`, then move on.
- Autonomous product/behavior decisions: make them, label them in `BUILD_LOG.md`, and surface anything uncertain as an open question FOR THE PR — never as a live prompt.
- Safety: tests use the LOCAL sqlite file only — never set `TURSO_*` in the test env, never run seed/backfill against the shared prod DB (a guard is already in place). Never `gh auth switch`; commit/push as the personal account per the repo `CLAUDE.md`. Put NO real credentials anywhere in the repo.
- Blocked-by-owner steps (e.g. the Garmin first-login MFA, which needs the owner's one-time interactive login and cannot be done headless): build everything else, clearly document the one-time manual step in `services/garmin-sync/README.md` + `BUILD_LOG.md`, stub it so the rest works, and keep going. Do not stop.

### Self-validation & review (REQUIRED before you consider the PR done)
- **Self-QA every screen you build.** After implementing a screen/component, RUN the app and LOOK at it: capture screenshots (and a short screen recording for flows like the metrics panel, the manual-entry form, the recovery badge + info popup, and the readiness snapshot), in BOTH light and dark themes. Critique your own output honestly — if it is ugly, cramped, misaligned, low-contrast, inconsistent with the existing UI, or broken, WRITE DOWN exactly what is wrong and FIX the issues YOU found before moving on. Never ship UI you have not looked at. Use the project's run/screenshot flow (see the `run` skill and Playwright's screenshot/video capability).
- **Validate behavior, not just render:** exercise the real flows (manual metric saves, the ingest endpoint accepting a snapshot, readiness/recovery numbers moving sensibly, the recovery badge decrementing, easy activities NOT adding debt) with tests plus a real run.
- **Open the PR and get a Cubic review.** Once the feature is functional and `npm run verify` is green, open the PR (this triggers Cubic's AI review). Wait for Cubic's review, then address every finding that makes sense, reply to each comment (explaining the fix or why not), and re-run verify. Iterate until Cubic's findings are resolved or reasonably answered. Do all of this autonomously — never ask the owner.

## 1. What you are building and why

A **source-agnostic daily health, readiness, and recovery layer**. The app tracks training LOAD (CTL/ATL/TSB via `src/lib/fitness.ts`) but has no bodily-recovery signal, because Strava provides none. This feature ingests HRV, sleep, resting HR, stress, Body Battery, etc. from a wearable, lets the athlete also enter subjective metrics manually, computes an **app-owned readiness score** and a **global recovery-remaining** countdown, and feeds the AI coach a morning "how ready am I to train today" summary. It mirrors TrainingPeaks' Metrics view.

The athlete uses a Garmin Forerunner 965 now and switches to a COROS watch in ~1 month, so the whole thing must be **decoupled from any single source** and never bake Garmin/Coros specifics into core.

## 2. Locked product decisions (do not relitigate)

- **The app owns readiness and recovery.** Ingest only the raw normalized signals (HRV, RHR, sleep, stress, etc.); compute our own readiness and recovery from them so the numbers are consistent across Garmin and Coros (their native readiness/Body-Battery scores are proprietary and not comparable). The device's native readiness/Recovery Time may be stored and shown as a secondary reference, but ours is canonical.
- **Garmin source** = `cyberjunky/python-garminconnect` run as a **standalone daily job on a GitHub Actions cron**, which POSTs a normalized health-snapshot JSON to an authenticated app ingest endpoint. The app never imports Garmin code.
- **Coros = seam now, adapter later.** Build the source-agnostic seam + the Garmin adapter now. Add a Coros adapter when the watch arrives (its official MCP `mcp.coros.com/mcp` is agent-facing/beta; it will suit live coach queries more than daily ingest). Do NOT build Coros ingestion now.
- **Recovery = one global, compounding, time-decaying state** (NOT per-activity). Shown as a global "recovery remaining" badge that decrements live. Model in section 5.
- **v1 scope** includes all of: ingest pipeline + metrics panel + global recovery-remaining + the readiness score.
- **Credentials/tokens live only in the sync service** (GitHub Actions secret), never in the app or repo.
- Single owner: scope via the existing identity seam (`currentAthlete()`); do NOT add `athlete_id` columns (consistent with the app's product decisions).

## 3. Architecture

Follow the codebase's existing seam discipline (identity, telemetry, storage, the `db/` data layer). Keep pure domain logic IO-free and unit-tested; keep the single-SQL-seam (`db/client.ts`) and single-mutation-seam (`actions.ts`) intact; add i18n en+pt for all strings; everything must pass `npm run verify`.

### 3a. Generic domain model (core, source-agnostic)
- New table `health_metrics`, one row per `(date, metric, source)`: `date TEXT`, `metric TEXT`, `value REAL` (or a small typed value), `unit TEXT`, `source TEXT`, `recorded_at TEXT`. Add via an idempotent migration in `db/migrations.ts` (next `schema_version`). Index by `(date)` and `(metric, date)`.
- `metric` is a closed union (types.ts): `sleep_total|sleep_deep|sleep_light|sleep_rem|sleep_awake|sleep_quality|hrv_overnight|hrv_status|resting_hr|stress_avg|body_battery_low|body_battery_high|respiration|spo2|steps|weight` plus subjective `fatigue|soreness|stress_subjective|mood|sickness|injury`. (Confirm/extend against the Garmin field list in the research doc.)
- `source` union: `garmin | coros | manual | computed`. Multiple sources may exist for the same `(date, metric)`; a resolver picks the preferred source per metric (device > manual by default; user-overridable later). Keep this resolver in one place.
- Query helpers in a new `db/health.ts` (through the existing `many`/`one` plain-object seam). No libsql import outside `db/client.ts`.

### 3b. Health-source seam
- A `HealthSource` concept: adapters normalize a provider's data into the generic `health_metrics` shape. Garmin's adapter lives OUTSIDE core (the Python sync). Manual entry is an in-app adapter (a form → server action). Core only reads normalized data and exposes the ingest endpoint. Document the seam so adding Coros later is a contained change.

### 3c. Ingest endpoint (machine-to-machine auth)
- A route handler `POST /api/health/ingest` that accepts the normalized snapshot JSON (contract in the research doc), validates it (reject unknown metrics/sources; NaN-guard values), and upserts into `health_metrics`. 
- Auth is NOT the user session — it is a machine token: require a header bearer/HMAC checked against an env secret (`HEALTH_INGEST_SECRET`) using the existing `constantTimeEqual` (`src/lib/crypto.ts`). The sync service holds the same secret. Never expose this on the user path.
- Idempotent upsert (re-running a day's sync overwrites that day's rows for that source).

### 3d. Garmin sync service (standalone, decoupled)
- Put it under `services/garmin-sync/` (its own `requirements.txt`, `sync.py`, `README.md`) — clearly separate from the Node app; the app must build/test with zero awareness of it.
- Uses `python-garminconnect` (MIT). Auth reality (see research doc): Garmin fights scrapers; the library survives via `curl_cffi` TLS impersonation + MFA + a cached token. First login is interactive (once) to pass MFA and produce a cached token; the daily job reuses the token. Store the cached token + Garmin login as **GitHub Actions secrets**.
- Daily job: fetch the recent day(s) of health metrics (use the exact endpoints/fields in the research doc), normalize to the ingest JSON contract, POST to `/api/health/ingest` with the shared secret. Fetch a small trailing window (e.g. last 3-7 days) each run so late-syncing data backfills.
- A `.github/workflows/garmin-sync.yml` cron (early morning local time; pick a UTC hour). Must **fail gracefully and loudly** (log, non-zero exit that alerts, but never corrupts app data). Treat Garmin as best-effort: the app must work fully with stale or absent health data.
- The research doc has a runnable sync sketch and the JSON contract — start from it.

### 3e. Readiness engine (pure, `src/lib/readiness.ts`, IO-free)
- `computeReadiness(inputs) -> { score: 0..100, band: "ready"|"caution"|"rest", components: {...} }`. Inputs: HRV (ln rMSSD vs rolling 7-day baseline + smallest-worthwhile-change band), RHR vs baseline, sleep (duration + quality/stages), stress/body-battery, and training-load context (TSB and ACWR/ramp-rate from the fitness engine). Use the weighted model + default weights + bands + red-flag overrides + **weight-renormalization for graceful degradation** exactly as specified in `RESEARCH_COROS_AND_READINESS.md` (do not invent your own — that doc did the sourcing; flag that vendor weights are proprietary/approximate). Named constants; colocated unit tests with known-value assertions.

### 3f. Recovery engine (pure, `src/lib/recovery.ts`, IO-free) — GLOBAL + COMPOUNDING + INTENSITY-DRIVEN
A single global recovery-debt in hours, deterministic over the recent activity sequence:
- State: `R` (debt hours) with an `as_of` timestamp.
- Drain: between events `R(now) = max(0, R(as_of) - hoursElapsed * drainRate)`.
- Each finished activity adjusts `R` ON TOP of the residual (compounds): `R += recoveryCost(activity, athleteState)`.

**`recoveryCost` is INTENSITY-DRIVEN, not volume-driven — this is the critical requirement.** Volume/TSS alone is wrong: an easy 90-minute run has real TSS but should add almost nothing.
- Below a **recovery-intensity floor** (low intensity factor / Z1–low-Z2 HR — key off the activity's `intensity_factor`/`method` and avg HR vs thresholds), `recoveryCost ≈ 0`. Genuine active recovery (at/under the floor) may add a small NEGATIVE (or bump `drainRate`), so it never increases debt and can slightly speed recovery. This must reproduce the real scenario: "3h left to recover, did a very easy jog → stays flat or ticks down, does NOT jump."
- Above the floor, cost grows NONLINEARLY with intensity (IF²-style; intensity dominates, duration is a lesser multiplier). A threshold/race session costs a lot; an easy session costs ~0 even if long.
- Modulated by fitness (higher CTL → cheaper) and by current state (already deep in debt / negative TSB → a hard session costs disproportionately more; compounding "stupid second hard workout" behavior).
- Named, tunable constants; document that they need real-data tuning.
- Implement as a pure fold over recent activities (last ~10-14 days) with their `activity_load` (TSS/method/IF), avg HR, timestamps, and the athlete's CTL/TSB, returning `{ remainingHours, asOf, contributions: [{activity, addedHours}] }`. Recomputable any time.

**Two tiers (physiology beats pure load here):**
1. v1 = the load/intensity model above (works today from `activity_load`; transparent, explainable in the info popup).
2. Once the health integration is ingesting HRV/RHR/sleep, those signals MODULATE the model — recovered HRV drains `R` faster, suppressed HRV holds it longer — approaching the physiological behavior of Garmin's Recovery Time (which is exactly why an easy run can DROP Garmin's number: it is HR/HRV-based, not load-based). Design `recovery.ts` so an optional readiness/HRV input can be threaded in later without a rewrite.

- This is the continuous-time analog of ATL (acute fatigue) — reuse the fitness engine's CTL/TSB; do not duplicate that math.
- The device's Recovery Time/Timer (Garmin/Coros) is ingested and shown NEXT TO ours as a reference. Precedence (computed-canonical for cross-source consistency vs device-primary for physiological accuracy) is a documented tuning decision, not hardcoded — expose it so it can be flipped.
- **Honest limitation (state it in code + the info popup):** a load-only model approximates Firstbeat's physiological model; the intensity floor + later HRV modulation get most of the way; exact device parity is not the goal.
- Colocated unit tests: two stacked hard sessions > either alone; an easy/active-recovery session at the floor adds ~0 (assert it does NOT increase, and that a floor session after a hard one does not raise `R`); the value decays to 0 over time; ordering/compounding correct; intensity dominates volume (a long easy session costs less than a short hard one).

### 3g. UI
- **Health / Metrics panel** (a page or a day-detail modal, matching the TrainingPeaks screenshots): per-day metric tiles + trend charts (30-day with normal-range band + 7-day average, in the house SVG-chart style used by `activity-chart`/`pmc-chart`), each tile showing its source. Manual-entry form for the subjective metrics + weight (React 19 `<form action>`; validate server-side). Reuse the plain-object db seam.
- **Global recovery-remaining badge** in the header/nav (the sketched circle): shows hours remaining, decrements live on the client from `as_of`, with an **(i) info popup/page** that explains the calculation transparently (each recent workout's added cost, the time-decay, the compounding, that it is app-computed; device value shown as secondary if present). This is v1's recovery UI (not per-activity).
- **Readiness snapshot**: a morning readiness score + band + component breakdown, on the dashboard/fitness area. The AI coach (`src/lib/coach.ts`) reads the generic `health_metrics` + readiness/recovery to write the morning "how ready am I to train today" narrative — reading the generic model only, never source specifics.
- All strings en+pt (`src/lib/i18n/`). Graceful empty states when no health data yet.

### 3h. Non-negotiables
- `npm run verify` green (typecheck+lint+format+vitest[node+jsdom]+knip+madge+playwright). Pure engines get node unit tests; the ingest route gets a test; new components get jsdom tests. en/pt parity. Single-SQL-seam and single-mutation-seam preserved. No Garmin/Coros imports in core. The app must build and pass with the `services/garmin-sync/` folder completely ignored (add it to knip/tsconfig excludes as needed).

## 4. Suggested build order (all in v1)
1. Domain model + migration + `db/health.ts` + the source resolver.
2. Ingest endpoint (`/api/health/ingest`) + machine-token auth + tests.
3. Manual-entry adapter (form + action) so the panel works with zero device data.
4. Metrics panel + trend charts + source display.
5. Readiness engine + recovery engine (pure, tested) + their UI (readiness snapshot, global recovery badge + info popup).
6. Coach integration (morning readiness narrative from the generic model).
7. `services/garmin-sync/` (Python job) + GitHub Actions cron + the token/MFA setup doc. Verify end-to-end against the real endpoint with a manually-generated token.

## 5. Constraints & risks to honor
- Garmin access is unofficial and fragile (TLS fingerprinting broke prior libraries in 2026); the sync must degrade gracefully and the app must never depend on it being fresh. Best-effort data with clear "last updated" + source labels.
- Secrets only in the sync service / Actions secrets; never in the app or committed. MFA handled at first login, token cached.
- Keep it decoupled: adding Coros later must not touch core beyond a new adapter + a source enum value.
- Do not overfit the readiness/recovery constants; expose them as named constants and note they need real-data tuning.

## 6. Acceptance
- Health data (manual first; Garmin once the job runs) appears in the panel with source labels and trend charts.
- App-owned readiness score + band render; the global recovery-remaining badge decrements live and its info popup explains the calc; recovery compounds correctly for stacked workouts (unit-tested).
- The coach produces a source-agnostic morning readiness summary.
- `npm run verify` green; core has no Garmin/Coros imports; the app works fully with no health data.

---

_This plan was produced in a planning session; the two `RESEARCH_*.md` files hold the granular contracts (Garmin fields + Python sketch + ingest JSON; readiness formula + metric mapping). Read them first._
