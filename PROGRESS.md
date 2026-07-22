# Training Hub build progress

Autonomous build session started 2026-07-22. Architect + validator: Claude (Opus 4.8).
Each phase: sub-agent implements, I validate against real Turso data, then commit + push + verify prod.

Prod: https://training-hub-psi-one.vercel.app · Shared Turso DB (local dev + prod point at the same database).

---

## ASSUMPTIONS (please correct any that are wrong)

Threshold and body values seeded for the fitness engine (all editable in Settings → Athlete thresholds):

| Value | Seeded | Notes |
|-------|--------|-------|
| Max HR | 199 bpm | From Garmin (real) |
| Resting HR | 50 bpm | **ASSUMED — not measured.** Flagged "estimated" in the UI. Affects every HR-based load number. |
| LTHR | 176 bpm | From Garmin, set 19 Jul 2026 (real) |
| Threshold pace | 4:29 /km (269 s/km) | From Garmin, set 19 Jul 2026 (real) |
| FTP | 150 W | **PLACEHOLDER — no test done.** Flagged "provisional". Only affects power-based ride load (few rides have power). |

Engine modelling choices (reversible; documented so you can veto):
- Training load is normalised to a single **TSS-equivalent scale** so every sport is comparable in the PMC. Per-activity method priority: power (rides w/ power) > pace rTSS (runs) > HR (hrTSS, HRR vs LTHR) > session-RPE. Method is shown per activity and the value is editable.
- **hrTSS** uses heart-rate reserve relative to LTHR: `IF = (avgHR − restingHR)/(LTHR − restingHR)`, `TSS = hours × IF² × 100`. This is why resting HR matters.
- **rTSS** (runs): `IF = thresholdPace / activityPace`, `TSS = hours × IF² × 100`.
- **PMC**: CTL = 42‑day EWMA of daily TSS, ATL = 7‑day EWMA, TSB = yesterday's CTL − yesterday's ATL. Curves seeded from the first activity (2023‑12‑01) starting at 0, so the earliest ~2 months ramp up artificially, then stabilise.
- Fitness dashboard added as its own `/fitness` tab (does **not** replace the home log). Easy to promote to home later.

---

## Phase 3 — Fitness engine ✅ shipped

**What shipped**
- `src/lib/fitness.ts`: pure engine — `computeLoad` (power→pace→hr→rpe priority, quadratic TSS), `computePmc` (CTL 42d / ATL 7d EWMA, TSB = prior day CTL−ATL), `formState`, Friel `hrZones`/`paceZones` (exported for Phase 6).
- Two new tables (`athlete_thresholds`, `activity_load`), idempotent additive migration; thresholds seeded only when empty.
- Settings → "Athlete thresholds" card (editable Max HR / LTHR / threshold pace / resting HR / FTP + estimated/provisional flags). Saving recomputes all loads.
- `/fitness` dashboard (new nav tab, does not replace home): Form/Fitness/Fatigue/7-day-ramp tiles, PMC chart (CTL area + ATL line + TSB band), weekly-load bars, window selector 90d/6m/1y/all.
- Per-activity load display + manual override + reset on the activity page.
- `npm run backfill:load` script; ran it against the shared Turso DB → **1230 activities** now carry load.

**Validation (my independent reference vs. live app, all matched exactly)**
- Persisted `activity_load`: 1230 rows (0 manual). Methods: hr 857, pace 333, power 40. 1 activity has no HR/pace/power/RPE → no load (expected).
- Known races: Jundiaí HM **152.7 TSS** (pace, IF 0.964), Athena's HM 149.7, ASICS Golden 132.8, Hoka 30k 209. Jundiaí page confirms 4:39/km, 176 avg / **190 max** HR.
- PMC today (2026-07-22): **CTL 47.5, ATL 52.2, TSB −5.3** — dashboard shows Fitness 48 / Fatigue 52 / Form −5 (Neutral). Peak CTL ever 59.1 (Sep 2025).
- `npm run build` clean (route `/fitness` registered), `npx eslint src` exit 0.
- Screenshots (light + dark, viewed): `scratchpad/shots/fitness-6m-{light,dark}.png`, `fitness-all-{light,dark}.png`, `settings-{light,dark}.png`, `activity-128-{light,dark}.png`.

**Deferred (roadmap nice-to-haves, not blocking):** recovery-hours estimate, streak, week-vs-plan.
