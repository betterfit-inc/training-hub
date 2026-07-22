# Training Hub roadmap: the fitness hub

Goal: Training Hub becomes the first app opened every day. One place that ingests every activity from every source, shows fitness, fatigue and recovery computed from the complete picture, tracks gear (shoes and bikes), and has an AI layer to analyze workouts.

## What the research established (July 2026)

- TrainingPeaks Virtual has an official Strava connection; completed rides upload to Strava automatically. Both indoor rides already arrived in the hub as `VirtualRide`, so ingestion for the current setup (COROS watch to Strava, TPV to Strava) works today with zero new integrations.
- COROS officially supports importing .fit/.tcx activities into a COROS account so they count toward EvoLab, but only manually through their site or app. There is no public COROS API in either direction.
- Garmin has no personal API, and the unofficial route (garth-style mobile app impersonation) broke in March 2026 when Garmin tightened Cloudflare TLS fingerprinting. Treat Garmin automation as unreliable until the community adapts. Garmin devices still push to Strava natively, so Garmin as a source is covered anyway.
- The community answer to this exact frustration is either "route everything through Strava" or intervals.icu, which has official direct sync with COROS, Garmin, Wahoo, Polar and Suunto plus a genuinely open personal API. It can serve as a legal aggregator bridge and as a reference implementation for load math.
- Conclusion: do not fight the silo problem at the source apps. Make the hub compute its own fitness picture from the complete data it already receives. Fixing COROS EvoLab specifically is a best-effort extra, not the foundation.

## Phase 1: Cycling parity and bikes (small, do first)

- Bikes as gear: bike gallery like shoes (photo, name, odometer km, baseline from Strava gear totals), matched via Strava `gear_id` (fetch `athlete.bikes`, not just `athlete.shoes`). No splits: one ride, one bike.
- Indoor vs outdoor split per bike and in insights (`VirtualRide` vs `Ride`).
- Ride-aware activity pages: speed instead of pace, average and max power, cadence, energy from the cached detail payload.
- Maps for outdoor activities: draw `summary_polyline` (already cached in raw/detail JSON) as an inline SVG path. No tiles, no keys, works offline; optionally upgrade to Leaflet later.
- Log and review tweaks: ride rows show speed and power, review flow already treats rides as optional-shoe.

## Phase 2: Ingestion completeness and streams

- Streams cache: fetch `activities/{id}/streams` (heartrate, watts, cadence, velocity, altitude, time) lazily like detail_json, store compressed JSON. Enables charts and precise load math.
- Pace/HR/power chart on the activity page (downsampled, dataviz-styled).
- .fit upload: drag-and-drop ingestion parsing with a fit parser; creates a full activity with streams. Universal fallback for any source without an API, deduped against Strava by start time and duration.
- Optional intervals.icu bridge: pull activities and wellness via its open API for anything Strava misses; also a cross-check for our load numbers.

## Phase 3: The fitness engine (the differentiator)

- Athlete settings: max HR, resting HR, LTHR, threshold pace, FTP.
- Training load per activity, best available method: power TSS (rides with power) > pace-based rTSS (runs) > HR TRIMP (anything with HR) > session RPE x duration (already collected in review!). Editable per activity.
- Daily load into the Banister/PMC model: CTL (fitness, 42d EWMA), ATL (fatigue, 7d EWMA), TSB (form). Recovery-hours estimate from recent load and intensity.
- Fitness dashboard as the new home view: today's form and recovery state, load trend chart, week vs plan, streak. The log moves one click away.
- Backfill: compute historical load from the 1200+ synced activities (avg HR + duration exist for nearly all), so the curves start with 2.5 years of history on day one.

## Phase 4: AI coach

- Per-activity analysis and chat (Claude API): context is the activity, laps, stream summary, journal notes and current CTL/ATL/TSB. Ask anything about the workout.
- Weekly digest: what the week did to fitness, what stands out, suggestions.
- Optional: auto-summary suggestion at review time.
- Needs `ANTHROPIC_API_KEY` env; conversations stored per activity.

## Phase 5: Write-back and dirty corners (best effort)

- COROS completeness: one-click .fit download bundle for TPV rides to hand-import into COROS (officially supported import), and research the reverse-engineered COROS app API for automated upload. Personal use only.
- Garmin write-back: revisit garth-family tooling once the March 2026 breakage settles.
- TrainingPeaks API is partner-only; TPV-to-Strava covers the practical need.

## Open questions

- Is the Garmin app tied to an actual Garmin device in use, or just installed? (Determines whether Garmin matters at all.)
- Thresholds for the engine: current max HR, resting HR, LTHR, FTP, threshold pace.
- Should the fitness dashboard replace `/` or live as its own tab?
