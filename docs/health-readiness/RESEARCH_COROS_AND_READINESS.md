# COROS Data Access + Training-Readiness Science

Research notes for the source-agnostic daily health/recovery snapshot and morning
"training readiness" view. Read-only research, no code changed. Written 2026-07-23.

Scope: (A) how to get health data out of COROS (owner is on a Garmin FR965 now,
switching to COROS in ~a month), and (B) the sports-science of a daily readiness
score plus a concrete, implementable model for this app.

Honesty note up front: the exact scoring formulas of Garmin/Firstbeat, WHOOP, and
Oura are all proprietary and undisclosed. Anything specific below about their
internal weights is either explicitly labeled as a community estimate or is
inferred from vendor docs. The proposed model in Part B section 4 is our own,
built from the public methodology (mainly HRV-guided training literature), not a
clone of any vendor.

---

## 1. COROS data access summary

### 1.1 The official COROS MCP: it is an MCP, not a REST data API

COROS shipped an **official MCP server** (Model Context Protocol), documented at
`coros.com/stories/coros-metrics/c/mcp-testing`. Key facts:

- **Shape: agent-facing MCP, not a developer REST API.** It is "a standardized
  plug that allows an AI model to securely connect" to your COROS data. You add
  the endpoint to an AI client's connector settings (Claude, ChatGPT) and it
  exposes tools the model calls. There is no `client_id`/`client_secret`, no
  developer portal, no documented HTTP resource routes you call yourself.
- **Endpoint:** `https://mcp.coros.com/mcp` (regional URL pasted into the AI
  tool's connectors panel). Regional variants are implied but I did not find the
  full list published.
- **Availability: testing / staged rollout, not a stable GA product.** The page
  slug is literally `mcp-testing`; COROS says each release "adds new data types"
  and "improves reliability," and an independent tester (the5krunner, 2026-05-13)
  hit "repeated API unavailability errors" during use. Treat it as beta. No
  waitlist was mentioned; access is self-serve per user.
- **Auth: per-user OAuth-style authorization via COROS account login.** "Access
  is only granted through explicit user authorization. You decide whether to
  connect your account." No API key. Requires a paid AI plan (Claude Pro /
  ChatGPT Plus) in practice because free-tier message limits make it unusable.
- **Read-only at launch.** The model cannot write plans back to the COROS
  calendar.

**Data exposed** (independent inventory counted ~15 tools across 5 groups):

- Profile and hardware: height, weight, birthday, gender, device IDs, firmware.
- Activities: workout list (date, sport, location, time, distance, pace), plus
  per-workout HR / pace / elevation / cadence detail and narrative summaries.
- Daily health: steps, calories, average and **resting heart rate, stress, sleep
  (duration + deep/light/REM splits + nap windows)**.
- Assessments (EvoLab): **HRV daily average, recovery percentage/level, training
  load ratios, VO2max, threshold pace, race predictions (5K to marathon)**.
- Planning: the current training calendar.
- Files: `.fit` download per workout (full GPS + second-by-second), capped at
  **50 file requests per calendar day**.

**Withheld:** per-second HR/pace streams and GPS detail inside the structured
responses (only via the capped .fit download), lap/interval splits, cycling
power, running dynamics (GCT, vertical oscillation), and gear/shoes/segments/
nutrition/hydration.

So on paper the official MCP covers essentially every field the readiness
snapshot needs: sleep + stages, HRV, resting HR, stress, recovery level/timer,
Base/Running Fitness, VO2max, and load ratios.

### 1.2 Can it do (a) daily DB ingest and (b) live AI-coach queries?

- **(b) Live AI-coach query: yes, this is exactly what it is for.** If the coach
  runs on an MCP-capable client (Claude with connectors, or your own MCP client),
  point it at `mcp.coros.com/mcp`, authorize once, and it can query live. Caveats:
  read-only, beta reliability, and it binds the coach to the COROS session shape.
- **(a) Daily snapshot ingest into our DB: awkward, not the intended shape.** The
  official MCP is an interactive per-user OAuth connector designed for chat
  clients, not a machine-to-machine API for an unattended cron job. You can drive
  an MCP server programmatically from your own MCP client and persist the tool
  outputs, but you are maintaining an authorized session against a beta endpoint
  built for a different use case. For reliable scheduled ingest, prefer one of:
  1. **Official COROS API application** (`support.coros.com` "Submit an API
     Application"). COROS has no public Strava-style API; you file a request and
     they approve selectively based on market size and intended use. Best if you
     want a sanctioned, stable feed, but approval for a single-user hobby app is
     unlikely.
  2. **Third-party aggregator (Terra or Spike).** Both expose COROS (and Garmin)
     through one normalized API with webhooks; Terra has a free tier. This is the
     cleanest **source-agnostic** route: one integration covers the Garmin-now /
     COROS-later switch and hands you already-normalized activity/daily/sleep/HR
     data. Downsides: third-party dependency and their data-scope limits.
  3. **Unofficial COROS Training Hub API** (`apieu.coros.com`, email+password
     login, token cached locally). This is what the community MCP servers and
     libraries use. It exposes the full daily-health set (sleep, HRV, RHR, stress,
     daily metrics) plus activities. Fine for a private single-user app if you
     accept that it is unsanctioned and can break without notice.

**Recommended architecture:** ingest into our own normalized `health_snapshot`
table via route (2) or (3), and have the AI coach read our DB, not COROS
directly. That keeps the coach identical across the Garmin era and the COROS era
and insulates it from the beta MCP's reliability. Optionally also stand up our
own MCP over our DB so the coach (or a chat client) queries the normalized model.
Use the official COROS MCP as a convenience/exploration tool, not the ingest
backbone.

---

## 2. xballoy/coros-api assessment

Repo: `github.com/xballoy/coros-api`.

- **Language/runtime:** TypeScript on Node.js (95.6% TS), pnpm, `.nvmrc`-pinned
  Node. Good fit for a Next.js/TS codebase if used at all.
- **Maturity:** small but active. ~61 stars, ~12 forks, ~951 commits. Prominent
  README warning: "This repository is using a non-public API from COROS Training
  Hub that could break anytime." Endpoints are documented via Bruno in an `api/`
  folder.
- **Auth:** email + password stored in a `.env` file (plus the COROS API base
  URL). Same unofficial Training Hub auth as the other community tools.
- **Data exposed:** this is the important limitation. It is an **activity-file
  export tool**, not a health-metrics library. It exports activities as FIT / TCX
  / GPX / KML / CSV across many sports, plus training-schedule export. It does
  **not** surface sleep, HRV, resting HR, or stress.

**Verdict:** insufficient on its own for the readiness snapshot, because the
daily-health metrics we care about are not exposed. If you go the unofficial
route, the better reference is a Training-Hub client that hits the daily-health
endpoints. For example `github.com/cygnusb/coros-mcp` (Python 3.11+, fastmcp +
httpx + pydantic + cryptography, token stored in system keyring) reads sleep with
stages, nightly HRV and baseline, daily metrics (resting HR, training load,
VO2max, lactate threshold, stamina), activities with laps/HR/power zones, and
structured workouts, all against `apieu.coros.com`. Use xballoy for bulk activity
FIT export; use a cygnusb-style client (or reimplement its handful of endpoints
in TS) for the daily-health fields.

---

## 3. Garmin <-> COROS metric mapping to a source-agnostic model

Goal: a generic `HealthSnapshot` the fitness engine and coach consume, that both
watches populate. COROS's suite is EvoLab; Garmin's is Firstbeat.

| Generic field (our model) | COROS (EvoLab) | Garmin (Firstbeat) | Notes / caveats |
|---|---|---|---|
| `ctl` / chronic fitness | Base Fitness (trailing ~6-week load) | No consumer-facing CTL; VO2max + "Load Focus" proxy (Firstbeat internal has a CTL analog) | We already compute CTL ourselves from per-session load; use device value only as a cross-check. |
| `atl` / acute load | 7-Day Load | Acute Load (7-day, EPOC-based) | Both are ~7-day rolling; keep computing ours from TSS-equivalent. |
| `session_load` (TSS-equiv) | Load Impact (TRIMP: duration x HR-intensity x exp coeff, Polar-style) | Training Load (EPOC/excess post-exercise O2) | NOT interchangeable. COROS TRIMP vs Garmin EPOC differ 20-40% on the same workout. Rescale per source; do not mix raw values in one CTL series. |
| `acwr` / ramp rate | Load Ratio (7-day load vs recommended range from ~42 days) | Acute:Chronic (Acute Load vs 4-week baseline) | Same concept; we compute our own ACWR from our load series. |
| `recovery_time_hours` | Recovery Timer (red/yellow/green, hours to full recovery) | Recovery Time (hours) | Direct analog. Store hours + a traffic-light status. |
| `vo2max` | Running VO2max / Running Fitness | VO2max | Comparable but not calibrated; COROS ran low vs Garmin in one test (51 vs 56). Track per-source, do not treat a switch-day jump as a real change. |
| `race_predictions` | Marathon Level + 5K/10K/HM/M predictions | Race Predictor | Direct analog. |
| `hrv_rmssd` + `hrv_baseline` + `hrv_status` | HRV daily average (RMSSD-derived, overnight) | HRV Status: overnight RMSSD, 7-day rolling avg vs baseline; ~19 nights to establish; Balanced/Unbalanced/Low | Both are overnight RMSSD. We should compute our own ln rMSSD baseline (section 4) rather than trust each device's status label, so the signal is consistent across a watch switch. |
| `rhr` | Resting HR (daily) | Resting HR (daily) | Direct. Optical-sensor derived on both; expect a small offset at switch. |
| `stress` | Stress (0-100, HRV-based) | Stress (0-100, Firstbeat HRV-based) | Direct analog, 0-100, higher = more stressed. |
| `sleep` (duration + deep/light/REM + efficiency) | Sleep (duration, deep/light/REM, naps) | Sleep Score + stages | COROS gives stages but historically no single 0-100 "Sleep Score"; derive our own quality score from stages + efficiency (section 4) for consistency. |
| `body_battery` / energy reserve (0-100) | **No direct equivalent** | Body Battery (0-100, Firstbeat) | Garmin-only. Make this OPTIONAL; when absent, derive a proxy from stress + sleep + recovery. |
| `readiness` (0-100 composite) | **No single readiness score** (nearest is Recovery Timer status + HRV) | Training Readiness (0-100, six factors) | Neither device's native score should be the source of truth. We compute our own (section 4) so the number means the same thing before and after the switch. |

Two structural takeaways for the data model:
1. **Store per-source raw values plus a normalized field.** Load/TSS, VO2max, and
   sleep-score semantics differ enough between brands that mixing raw numbers into
   one time series will create phantom step-changes on switch day. Tag each row
   with `source: 'garmin' | 'coros' | ...` and rebaseline derived metrics.
2. **Body Battery and native readiness are brand-specific.** The generic model
   treats them as optional inputs, not required fields, and the app owns the
   canonical readiness computation.

---

## 4. Readiness science + a concrete model for this app

### 4.1 How the major systems compute it (public knowledge)

**Garmin / Firstbeat Training Readiness** (0-100, six inputs, weights undisclosed):
Sleep Score, HRV Status, remaining Recovery Time, Acute Training Load, Stress
History (24h), and Body Battery. Garmin publishes the factors but says "each
factor carries an undisclosed weighting; the combined result is normalised to
0-100" and that it "prioritises acute factors (last night's sleep, current
recovery) over longer-term trends." Reported bands: 80-100 Prime, 60-79 Primed,
40-59 Recovering, 20-39 Strained, 0-19 Very Strained; >73 "well recovered," <34
"accumulated fatigue."

**Garmin / Firstbeat HRV Status:** overnight RMSSD via optical sensor. Needs ~19
nights to establish a baseline, then a 7-day rolling average vs your personal
baseline/normal range. Status: Balanced (within normal), Unbalanced (outside
normal, high or low), Low (significantly below baseline).

**WHOOP Recovery** (0-100%): composite of HRV (the single most influential
input), resting HR, sleep performance (actual vs need), and respiratory rate,
plus skin temperature and SpO2. Bands: green 67-100, yellow 34-66, red 0-33.
Exact weights are proprietary. A widely-cited "HRV 70% / RHR 20% / sleep 10%"
split is a community estimate, NOT confirmed by WHOOP; treat it as folklore.

**Oura Readiness** (0-100): contributors include Resting Heart Rate, HRV Balance,
Body Temperature, Recovery Index (how quickly overnight HR returned to baseline +
recovery sleep after), Sleep, Sleep Balance, Activity Balance, and Previous Day
Activity. The "Balance" contributors use a 14-day weighted average (last 2-5 days
weighted slightly more) compared against a ~2-month long-term average.

**HRV-guided training (Altini / HRV4Training / EliteHRV / Kubios)** is the most
transparent and the backbone we should copy:
- Use **ln rMSSD** (natural log of rMSSD) because raw rMSSD is right-skewed.
- Baseline = **7-day rolling average** of ln rMSSD.
- "Normal range" / Smallest Worthwhile Change (**SWC**) = baseline +/- **0.5 x the
  between-day standard deviation**. The shaded normal band.
- Decision rule: HRV within or above the normal range -> clear to do high
  intensity; HRV below the lower SWC bound -> go easy / recover. The trend of the
  7-day baseline matters (rising = adapting, falling = accumulating fatigue).
- Need ~14 days (ideally 28) of daily morning/overnight measurements to trust the
  baseline.
- Nuance: both a drop below normal AND an abnormal spike above normal
  (parasympathetic saturation under heavy fatigue) can be warning signs; a drop
  is the primary red flag.

**Resting HR trend:** an elevated morning RHR vs baseline (roughly +5 to +7 bpm)
is a classic overreaching/illness signal and complements HRV.

**Sleep:** both duration (vs personal need) and quality (deep+REM proportion,
efficiency/continuity) matter; neither alone is sufficient.

**Subjective wellness (TrainingPeaks-style manual metrics / Hooper index):**
daily self-ratings of sleep quality, fatigue, muscle soreness, stress, and mood.
Cheap, and in the literature subjective wellness often detects acute fatigue as
well as or better than HRV. Worth capturing as an optional morning input.

### 4.2 Proposed model for this app

A 0-100 daily `readiness` score = weighted average of component sub-scores, each
in [0,100], computed only from metrics that are present, with weights renormalized
over the available components (graceful degradation). Baselines are personal and
rolling, so the number survives the Garmin -> COROS switch.

**Component sub-scores** (each clamped to [0,100]):

1. **HRV vs baseline** (`hrv_sub`) - primary signal.
   - `ln_today` = ln(rMSSD today) (or ln of the device HRV average).
   - `b7` = 7-day rolling mean of ln rMSSD; `m60`, `sd60` = 60-day mean and SD.
   - `z = (b7 - m60) / sd60`  (use the 7-day avg for stability; also compute the
     single-day z for red-flag detection).
   - `hrv_sub = clamp(60 + 20*z, 0, 100)`; if `z > +2` cap at ~85 (penalize
     parasympathetic-saturation spikes rather than reward them).
   - Interpretation: within SWC band (`|z| < 0.5` roughly) lands ~60-70; a
     meaningful suppression (`z = -1.5`) lands ~30.

2. **RHR vs baseline** (`rhr_sub`).
   - `d = rhr_today - rhr_baseline` (baseline = 7-to-30-day rolling mean).
   - `rhr_sub = clamp(85 - 6*max(d,0) + 3*max(-d,0), 0, 100)`  (at baseline ~85;
     +5 bpm -> ~55; a few bpm below baseline nudges up).

3. **Sleep** (`sleep_sub`).
   - `dur_score = clamp(100 * sleep_duration / sleep_need, 0, 100)` (need default
     8h, personalize over time).
   - `quality_score`: if stages present, score (deep+REM) fraction vs ~40-50%
     ideal plus efficiency; else use the device sleep score directly if provided.
   - `sleep_sub = 0.6*dur_score + 0.4*quality_score`.

4. **Stress / Body-Battery** (`energy_sub`) - optional.
   - If Body Battery present: use the morning value directly (0-100).
   - Else if stress present (0-100, higher = worse): `energy_sub = 100 - overnight_avg_stress`.
   - Else omit and redistribute weight.

5. **Training-load balance** (`load_sub`) - from our existing engine (TSB + ACWR).
   - Map TSB to freshness (monotonic, plateaus high): TSB <= -30 -> ~20;
     -30..-10 -> 40..70; -10..+5 -> 75..90; +5..+25 -> 90..100; > +25 -> ~95.
   - ACWR guardrail: `acwr_factor` = 1.0 in the 0.8-1.3 sweet spot, ramping down
     to ~0.7 as ACWR exceeds 1.5 (spike/danger zone). ACWR < 0.8 does not lower
     readiness (you are fresh) but flag detraining separately.
   - `load_sub = clamp(tsb_score * acwr_factor, 0, 100)`.
   - Note the ACWR literature is contested (the "sweet spot" weakens when treated
     as continuous data and outliers removed); use it as a soft guardrail, not
     gospel.

6. **Subjective wellness** (`subj_sub`) - optional but recommended.
   - Hooper-style morning ratings (sleep quality, fatigue, soreness, stress, mood),
     each mapped to 0-100, averaged.

**Default weights** (renormalized over whatever is present):

| Component | Weight (5 core) | Weight (with subjective) |
|---|---|---|
| HRV vs baseline | 0.30 | 0.25 |
| Sleep | 0.25 | 0.22 |
| Training-load (TSB + ACWR) | 0.20 | 0.18 |
| RHR vs baseline | 0.15 | 0.12 |
| Stress / Body-Battery | 0.10 | 0.08 |
| Subjective wellness | -- | 0.15 |

```
readiness = sum(w_i * sub_i for present i) / sum(w_i for present i)
```

**Bands (label):**
- **>= 70  Ready** (green): full send, hard/quality session OK.
- **45-69  Caution** (amber): aerobic/easy work, trim intensity or volume.
- **< 45   Rest** (red): recovery or rest day; check for illness, sleep debt, or a
  load spike.

(Thresholds are tunable; you can split "Ready" into 70-84 / 85-100 to mirror
Garmin's Primed/Prime if the UI wants five bands.)

**Red-flag overrides** (independent of the composite, because a single acute
crash should not be averaged away): if same-day HRV `z < -2` AND RHR is >5 bpm
above baseline (or a manual illness/soreness flag is set), cap the label at
Caution regardless of score, and surface the reason. This mirrors Garmin
prioritizing acute factors.

**Graceful degradation and confidence:**
- Any missing component drops out and its weight redistributes. So COROS-without-
  Body-Battery, or a night with no HRV read, still produces a score.
- If the HRV baseline is immature (< ~14 days of data) or fewer than, say, 3
  components are present, mark the score `low_confidence` and lean the UI on the
  components you do have (sleep + RHR + subjective are enough for a rough call).
- For the AI coach, expose not just the number but the **largest negative
  contributor** ("readiness 52, dragged down by HRV -1.8 SD and 5h sleep") so it
  can explain the recommendation.

**What is proprietary / unknown (be honest):**
- Garmin, WHOOP, and Oura all keep their exact weights and normalization secret.
  Our weights are a defensible starting point drawn from the open HRV-guided
  literature, not a reverse-engineered clone. Expect to tune them against the
  athlete's own outcomes.
- The WHOOP 70/20/10 split is unconfirmed community folklore.
- COROS does not publish a native readiness score at all, which is precisely why
  the app should own this computation.

---

## 5. Sources

COROS data access:
- https://coros.com/stories/coros-metrics/c/mcp-testing (official COROS MCP page)
- https://the5krunner.com/2026/05/13/coros-mcp-ai-data/ (independent MCP data inventory + testing notes)
- https://github.com/xballoy/coros-api (unofficial TS activity-export client)
- https://github.com/cygnusb/coros-mcp (unofficial Python MCP exposing daily health/HRV/sleep via apieu.coros.com)
- https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application (official API application process)
- https://tryterra.co/integrations/coros (Terra aggregator, COROS)
- https://www.spikeapi.com/integrations/coros (Spike aggregator, COROS)

COROS metrics / EvoLab:
- https://support.coros.com/hc/en-us/articles/4412789816724-EvoLab
- https://support.coros.com/hc/en-us/articles/4402922069780-Widgets-Recovery-Timer-EvoLab
- https://www.dcrainmaker.com/2021/05/revamped-training-explainer.html (Base Fitness ~ CTL, 7-Day Load ~ ATL, TRIMP-based Load Impact, VO2max comparison)

Readiness science:
- https://the5krunner.com/garmin-features/training/training-readiness/ (six factors + bands)
- https://wiki.garminrumors.com/HRV_Status (RMSSD, ~19 nights, 7-day rolling baseline, statuses)
- https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/ (WHOOP recovery inputs)
- https://developer.whoop.com/docs/whoop-101/ (WHOOP metric definitions)
- https://support.ouraring.com/hc/en-us/articles/360057791533-Readiness-Contributors (Oura contributors + 14-day balance windows)
- https://www.athletedata.health/guides/hrv-guided-training (ln rMSSD, 7-day baseline, SWC = baseline +/- 0.5 SD)
- https://hrv4training.substack.com/ (Altini methodology)
- https://www.hrv4training.com/quickstart-guide.html
- https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/ and https://help.trainingpeaks.com/hc/en-us/articles/204071764-Form-TSB (TSB zones)
- https://www.scienceforsport.com/acutechronic-workload-ratio/ (ACWR 0.8-1.3 sweet spot, >1.5 danger)
- https://www.globalperformanceinsights.com/post/has-the-acute-chronic-workload-ratio-been-debunked (ACWR criticism)
