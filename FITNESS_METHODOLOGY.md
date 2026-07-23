# Training Hub fitness engine: methodology, sources, and gap analysis

Research date: 2026-07-22. Scope: how training-load / fitness metrics (TSS, NP, IF, rTSS, hrTSS, CTL, ATL, TSB) are defined by the authoritative sources, how `src/lib/fitness.ts` computes them today, and the precise divergences worth fixing. This is a research document. No source code was changed.

Every numeric claim below was cross-checked against at least two independent sources. Where sources conflict, the conflict is stated and the more authoritative one is named. Constants labelled "computed" were evaluated directly (see the Verification notes at the end).

---

## 1. Executive summary

The engine is fundamentally sound. Its core TSS formula (`hours x IF^2 x 100`) is exactly the Coggan/Allen definition, and its CTL/ATL/TSB structure and the TSB "yesterday" convention match TrainingPeaks' documented formulas. The precision issues are in the inputs and a couple of edge choices, not the skeleton.

The changes that matter most, in order:

1. **Estimated power is treated as real power (correctness bug, ties directly into the fitness engine).** `computeLoad` uses Strava `weighted_average_watts`/`average_watts` for the power method without checking `device_watts`. Strava synthesises wattage for rides with no power meter, so some of the 40 power-method rides are getting a power-based TSS built on a guessed number. Gate the power branch on `rideMetrics().hasRealPower`. Highest value-to-effort.

2. **The resting-HR assumption (50 bpm, unmeasured) biases every HR-based load, and HR is the dominant method (857 of 1230 activities).** Because our hrTSS uses heart-rate reserve `(HR - RHR)/(LTHR - RHR)`, a wrong resting HR shifts the intensity factor most on easy sessions. A 10 bpm resting-HR error moves hrTSS by about +12% on an easy run (avg HR 120) and about +2% on a hard one (avg HR 160) (computed). That systematically tilts CTL/ATL. Measuring resting HR is a data fix, not a code fix, and it is the single biggest lever on aggregate accuracy.

3. **The CTL/ATL smoothing constant is a defensible modelling choice, not a bug.** We use `1/42` and `1/7`, which is Coggan's original and the commonly published TrainingPeaks form. GoldenCheetah and some others use the "purer" impulse-response form `1 - e^(-1/tc)`. The two converge to the identical steady state (so peak CTL and long-run values are unaffected); they differ only in transient responsiveness, and only materially for ATL (about 7% difference in the per-day weight). Changing it would rewrite every historical number for a small effect. Low priority, document rather than change.

4. **rTSS uses flat average pace, not Normalized Graded Pace (NGP).** For hilly or variable-pace runs this underestimates load. Real fix needs elevation/grade streams; a partial fix (a normalized running pace analogous to NP) needs per-second pace. Medium priority, data-gated.

5. **Seeding artifact is real but already washed out for today's numbers.** Curves seed at 0 on 2023-12-01. After roughly 5 time constants the seed contributes under 1%, so the 2026-07-22 CTL/ATL/TSB are unaffected. It only distorts the earliest few months of displayed history and any "as-of an old date" PMC (relevant to the coach analysing old races).

Everything else (the quadratic TSS, IF definition, VI, the Friel zone cut points, the TSB timing) is correct as written.

---

## 2. Definitions and formulas (authoritative)

### 2.1 Training Stress Score (TSS)

Coggan/Allen, *Training and Racing with a Power Meter*:

```
TSS = (t_sec x NP x IF) / (FTP x 3600) x 100
```

Since `IF = NP / FTP`, the `NP x IF / FTP` term equals `IF^2`, so the identical and more convenient form is:

```
TSS = (t_sec / 3600) x IF^2 x 100  =  hours x IF^2 x 100
```

One hour at threshold (IF = 1.0) is 100 TSS by definition. TSS is quadratic in intensity: doubling intensity quadruples the stress rate. Sources: Coggan formulas compilation (Goossens, *Critical Powers*), TrainingPeaks "Introduction to TrainingPeaks Metrics," TrainingPeaks "TSS Explained." All agree.

### 2.2 Normalized Power (NP)

Four steps (Coggan/Allen):
1. 30-second rolling average of power (approximates the ~30 s cardiovascular response lag).
2. Raise each rolling value to the 4th power.
3. Average those.
4. Take the 4th root.

The 4th-power weighting emphasises hard surges, so NP for a variable ride exceeds average power. Strava's `weighted_average_watts` is this quantity (Strava's name for NP). Source: Coggan formulas compilation (Goossens), TrainerRoad, TrainingPeaks coach blog. All agree.

### 2.3 Intensity Factor (IF) and Variability Index (VI)

```
IF = NP / FTP                (cycling)
IF = NGP / threshold_pace    (running, pace as speed)
VI = NP / average_power
```

IF is intensity relative to threshold (1.0 = threshold). VI near 1.0 means steady; higher means surging/intervals. Sources: Coggan compilation, TrainingPeaks "Introduction to Metrics." Agree.

### 2.4 Running TSS (rTSS) and Normalized Graded Pace (NGP)

rTSS is the pace-based analog of TSS, same structure:

```
rTSS = (t_sec x NGP x IF) / (threshold_pace x 3600) x 100,   IF = NGP / threshold_pace
```

which again reduces to `hours x IF^2 x 100`. The key input is **NGP**, the pace adjusted for grade (running uphill at a given pace costs more than the same pace on the flat) and for the metabolic cost of variable pacing, i.e. the running analog of NP. TrainingPeaks states rTSS (pace-based) is more accurate than HR-based load but still an approximation of true metabolic cost. Sources: TrainingPeaks "Running TSS (rTSS) Explained," "What is Normalized Graded Pace," "Low rTSS and Trail Running."

### 2.5 HR-based load: hrTSS and the TRIMP family

TrainingPeaks **hrTSS** is derived from time in heart-rate zones defined as percentages of LTHR, then scored to the TSS scale. TrainingPeaks explicitly ranks it below power-TSS and pace-rTSS in accuracy. Source: TrainingPeaks "TSS Explained."

The academic lineage is **TRIMP** (Training Impulse, Banister, 1970s). Banister's exponential TRIMP:

```
TRIMPexp = sum over session of [ D x HRr x (0.64 x e^(1.92 x HRr)) ]   (men)
                                [ D x HRr x (0.86 x e^(1.67 x HRr)) ]   (women)
HRr = (HR - restingHR) / (maxHR - restingHR)      (heart-rate reserve, Karvonen)
```

D is minutes. The exponential weight encodes that metabolic/lactate cost rises steeply with intensity, and the coefficient differs by sex to track the lactate curve. Heart-rate reserve (HRR) is regarded as superior to bare %HRmax. Other variants: Edwards (zone-count, five zones with weights 1..5, has boundary-discontinuity flaws), Lucia (zone-based on ventilatory thresholds), session-RPE (Foster). Sources: Fellrnr TRIMP, iamcoach.ai, veohtu.

Note the two important modelling choices any HR method makes: (a) anchor to LTHR vs maxHR, and (b) integrate the full HR stream (time-in-zone, the TRIMP/TP way) vs score a single average HR. Averaging HR then squaring underestimates variable sessions, because the square of the mean is below the mean of the squares (Jensen's inequality), the same reason NP exceeds average power.

### 2.6 Swim TSS (sTSS)

`IF = average_pace / threshold_swim_pace`, then the IF is **cubed** (not squared) before scaling, because hydrodynamic drag scales with velocity cubed. Source: TrainingPeaks "Calculating Swimming TSS." Different exponent from bike/run TSS.

### 2.7 CTL, ATL, TSB (the Performance Management Chart)

CTL (Chronic Training Load / Fitness) and ATL (Acute Training Load / Fatigue) are exponentially weighted moving averages of daily TSS with default time constants 42 d and 7 d.

There are two forms in circulation, and this is the one precision point worth stating carefully:

**Form A, Coggan's original / the commonly published TrainingPeaks form:**
```
CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) x (1/42)
ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) x (1/7)
```

**Form B, the exact impulse-response EWMA (GoldenCheetah, intervals.icu):**
```
CTL_today = CTL_yesterday x e^(-1/42) + TSS_today x (1 - e^(-1/42))
ATL_today = ATL_yesterday x e^(-1/7)  + TSS_today x (1 - e^(-1/7))
```

Per-day input weights (computed):

| tc | Form A weight `1/tc` | Form B weight `1 - e^(-1/tc)` | relative gap |
|----|----------------------|-------------------------------|--------------|
| 42 (CTL) | 0.023810 | 0.023528 | 1.20% |
| 7 (ATL)  | 0.142857 | 0.133122 | 7.31% |

Both are proper weighted averages (weights sum to 1), so for a constant daily load T both recursions converge to exactly T (verified: after 400 days of T = 100, both land on 100.0). The forms differ only in how fast they respond to change. Form A reacts slightly faster, so it produces marginally higher ATL peaks after a hard day and marginally more negative TSB. TSB / Form:

```
TSB_today = CTL_yesterday - ATL_yesterday
```

TrainingPeaks defines Form as **yesterday's** fitness minus **yesterday's** fatigue, i.e. the freshness you carry into today's workout before today's training is counted. Coggan's shorthand: "Form = Fitness + Freshness," Form = CTL + TSB. Interpretation bands (consolidated across TrainingPeaks PMC article, paincave, procyclingcoaching):

| TSB | Meaning |
|-----|---------|
| > +25 | Over-tapered, fitness decaying / detraining risk |
| +5 to +15 | Fresh, race-ready (target for A-races after taper) |
| -10 to +5 | Neutral, functional, normal in a block |
| -30 to -10 | Productive training / "grey zone," where adaptation happens |
| < -30 | Deep fatigue, elevated overtraining and injury risk |

Sources for CTL/ATL/TSB: TrainingPeaks "Science of the Performance Manager" (Coggan, defines the two-filter EWMA with tc 42/7), TrainingPeaks "What is the Performance Management Chart" (TSB = yesterday's CTL minus yesterday's ATL, verbatim), GoldenCheetah user group (Abou-Samra quotes Coggan's Form A; Martinez states GoldenCheetah uses `exp(-1/T)`, Form B, and that the difference from Form A is "not exactly the same" but negligible), paincave.io, procyclingcoaching.

---

## 3. The science: Banister to the PMC

The PMC is a productised, simplified descendant of the **Banister impulse-response (fitness-fatigue) model** (Banister et al., 1975; Calvert, Banister, Savage & Bach, 1976; Morton, Fitz-Clarke & Banister, 1990). Core idea:

```
Performance(t) = baseline + k_a x Fitness(t) - k_f x Fatigue(t)
```

Each training impulse (a workout's TSS/TRIMP) feeds two first-order exponential filters with different time constants: a slow positive "fitness" response (long tau) and a fast, larger negative "fatigue" response (short tau). Fatigue decays faster than fitness, so after a training stimulus fatigue clears first and net performance rises above the pre-workout level (supercompensation), then fitness slowly decays if training stops.

TrainingPeaks' "Science of the Performance Manager" (Coggan) maps this directly:
- **CTL = the fitness filter**, tau = 42 d.
- **ATL = the fatigue filter**, tau = 7 d.
- **TSB = CTL - ATL = the balance / freshness term**, a proxy for Banister's `k_a x Fitness - k_f x Fatigue`.

Coggan's simplification versus the full Banister model: TSS/TRIMP replaces the abstract "training impulse," the gain terms `k_a`/`k_f` are folded away (TSB just subtracts, implicitly `k_a = k_f = 1`), and the time constants are fixed defaults rather than fitted per athlete. The full Banister model fits `k_a, k_f, tau_a, tau_f` to an individual's performance tests; the PMC does not, which is why CTL/ATL are descriptive load-tracking curves, not calibrated performance predictors. Later refinements (Busso, 2003, variable dose-response) make the fatigue gain rise with training monotony, capturing that back-to-back hard days compound fatigue nonlinearly, which the linear PMC cannot represent.

Practical consequences relevant to us:
- **Ramp rate** is the week-over-week rise in CTL (TrainingPeaks guidance: roughly 5 to 8 CTL points per week is a sustainable build; higher raises injury/overtraining risk). Our dashboard already shows a 7-day ramp tile.
- **Seeding / initialization.** Because both filters are recursive, their early values depend on the seed. Seeding at 0 (as we do) understates true fitness for roughly 3 to 5 time constants after the first activity, producing an artificial early ramp. TrainingPeaks lets users set a starting CTL for exactly this reason.
- **What the numbers are not.** CTL is not VO2max and TSB is not a readiness score; they are exponential summaries of a single scalar load. They ignore sleep, HRV, life stress, and workout type. This is precisely the gap that the Garmin/COROS recovery ecosystems try to fill (Section 6).

References worth citing in code comments or docs:
- Banister EW, Calvert TW, Savage MV, Bach TM (1975/1976). "A systems model of the effects of training on physical performance." IEEE Trans. Syst. Man Cybern.
- Morton RH, Fitz-Clarke JR, Banister EW (1990). "Modeling human performance in running." J. Appl. Physiol. 69(3):1171-1177.
- Busso T (2003). "Variable dose-response relationship between exercise training and performance." Med. Sci. Sports Exerc.
- Coggan A. "The Science of the TrainingPeaks Performance Manager" (TrainingPeaks).
- Clarke DC, Skiba PF (2013). "Rationale and resources for teaching the mathematical modeling of athletic training and performance." Adv. Physiol. Educ.
- "The Fitness-Fatigue Model: What's in the Numbers?" IJSPP 17(5), 2022 (critical review).

---

## 4. How Training Hub computes it today (`src/lib/fitness.ts`)

### 4.1 Per-activity load: `computeLoad`

Method priority (strongest signal first), returns `null` if none apply:

1. **Power** (rides with FTP > 0). `power = rideMetrics().normalizedPower ?? avgPower`; `IF = clamp(power / ftpW, 0, 1.6)`.
2. **Pace / rTSS** (runs with threshold pace). `IF = clamp(thresholdPace / pace, 0, 1.5)`. Note pace is s/km so a faster run (smaller number) gives IF > 1 correctly.
3. **HR / hrTSS** (any sport with avg HR, requires `lthr > restingHr`). `IF = clamp((hr - restingHr) / (lthr - restingHr), 0, 1.5)`. This is Karvonen heart-rate reserve anchored to LTHR, not %LTHR.
4. **RPE** fallback: `tss = rpe x (moving_s / 60) x 0.25`. RPE 10 for 60 min = 150 TSS. Linear in RPE (session-RPE style), IF not reported.

All of methods 1 to 3 then run the shared quadratic:

```ts
function tssFrom(movingS, intensity) {
  return (movingS / 3600) * intensity * intensity * 100;   // hours x IF^2 x 100
}
```

This is exactly the canonical TSS formula (Section 2.1). TSS rounds to 1 dp, IF to 3 dp. Constants in code: `IF_CLAMP_POWER = 1.6`, `IF_CLAMP_PACE = 1.5`, `IF_CLAMP_HR = 1.5`.

NP extraction (`src/lib/cycling.ts`): `normalizedPower = raw.weighted_average_watts` (Strava's NP), `avgPower = raw.average_watts`, `VI = NP / avgPower`, `hasRealPower = raw.device_watts === true`. `hasRealPower` is computed but **not consulted** by `computeLoad`.

### 4.2 PMC: `computePmc`

```ts
const CTL_ALPHA = 1 / 42;
const ATL_ALPHA = 1 / 7;
// per day, over gap-filled ascending daily loads seeded ctl=atl=0:
ctl = prevCtl + CTL_ALPHA * (load - prevCtl);
atl = prevAtl + ATL_ALPHA * (load - prevAtl);
const tsb = i === 0 ? 0 : prevCtl - prevAtl;   // yesterday's CTL minus yesterday's ATL
```

This is **Form A** (Section 2.7), the Coggan/TrainingPeaks published form, and the TSB "yesterday" convention matches TrainingPeaks exactly. Seeds at 0 on the first activity.

### 4.3 Zones

`ZONE_FRACTIONS = [0.81, 0.9, 0.94, 1.0]` of LTHR (HR) and of threshold-pace speed (pace). This is the Friel 5-zone HR model (Z1 <81%, Z2 81-89%, Z3 90-93%, Z4 94-99%, Z5 >=100% of LTHR). `formState` buckets: `> +5` fresh, `-10..+5` neutral, `-30..-10` productive, `< -30` fatigued, consistent with the bands in Section 2.7.

### 4.4 Known reference values (from PROGRESS.md, seeded thresholds: maxHR 199, restingHR 50 estimated, LTHR 176, threshold pace 269 s/km, FTP 150 W provisional)

- Jundiai HM: 152.7 TSS, pace method, IF 0.964.
- Athena's HM 149.7, ASICS Golden 132.8, Hoka 30k 209.
- PMC on 2026-07-22: CTL 47.5, ATL 52.2, TSB -5.3. Peak CTL 59.1 (Sep 2025).
- Method mix across 1230 loaded activities: HR 857, pace 333, power 40, 1 with no signal.

Internal check: today's `CTL - ATL = 47.5 - 52.2 = -4.7`, but reported TSB is `-5.3`. The difference confirms the code is using yesterday's CTL and ATL, not today's, i.e. the TrainingPeaks convention is genuinely in effect.

---

## 5. Gap analysis (itemized, with numeric impact)

### (a) EWMA `1/tc` vs `1 - e^(-1/tc)` [Form A vs Form B]
- **What we do:** Form A (`1/42`, `1/7`). This equals Coggan's original and the commonly published TrainingPeaks formula. It is not "wrong."
- **Divergence:** Form B (GoldenCheetah, intervals.icu) uses per-day weights 0.023528 and 0.133122 vs our 0.023810 and 0.142857 (gap 1.2% for CTL, 7.3% for ATL, computed).
- **Numeric effect:** none at steady state (both converge to the same value; peak CTL 59.1 and today's CTL 47.5 would be essentially unchanged). Small transient difference, mostly in ATL: our ATL is a touch spikier and our TSB a touch more negative after hard days than a Form-B implementation.
- **Worth fixing?** No, unless matching GoldenCheetah/intervals.icu numbers exactly is a goal. It would rewrite every historical CTL/ATL/TSB for a sub-1% to ~7% transient change. Document the choice instead.

### (b) Seeding artifact
- **What we do:** seed CTL = ATL = 0 at the first activity (2023-12-01).
- **Effect:** the first ~3 to 5 time constants (roughly the first 4 to 6 months) understate fitness and show an artificial ramp. For today's numbers (2.5+ years later) the seed contributes under 1%, so CTL 47.5 / ATL 52.2 / TSB -5.3 are unaffected.
- **Where it still bites:** early displayed history, and any PMC computed "as of" an old date (the per-activity coach is fed today's CTL/ATL/TSB, but if it is ever changed to as-of-date, old races near the seed would read low). 
- **Worth fixing?** Low. Optionally seed the first ~42 days with a small nonzero estimate or hide the first 6 weeks of the curve. Cheap, cosmetic.

### (c) Estimated power tagged as real power (correctness bug)
- **What we do:** `computeLoad` uses `normalizedPower ?? avgPower` from Strava with no `device_watts` check, then computes power-based TSS.
- **Problem:** Strava fabricates `average_watts` (and sometimes a weighted value) for rides without a power meter. Those estimates are unreliable, yet they win the method priority over HR. `hasRealPower` already exists in `rideMetrics` but is ignored here.
- **Effect:** some of the 40 power-method rides carry a TSS built on a guessed wattage against a provisional FTP (150 W placeholder), so both the numerator (estimated power) and denominator (untested FTP) are soft. Bounded (40 of 1230 activities) but wrong in kind.
- **Worth fixing?** Yes, highest value-to-effort. Gate the power branch on `metrics.hasRealPower === true`; estimated-power rides then fall through to HR, which for those rides is the more trustworthy signal anyway. Recompute loads after.

### (d) Resting-HR assumption drives every hrTSS
- **What we do:** hrTSS IF = `(HR - restingHr)/(LTHR - restingHr)` with restingHr = 50, flagged estimated/unmeasured.
- **Effect:** HR is the dominant method (857 activities), so this constant tilts the whole PMC. Sensitivity to a 10 bpm resting-HR error (LTHR 176, computed):

  | avg HR | IF at RHR 40 | IF at RHR 50 (base) | TSS delta (RHR 50 to 40) |
  |--------|--------------|---------------------|--------------------------|
  | 120 (easy) | 0.588 | 0.556 | +12.1% |
  | 140 (mod)  | 0.735 | 0.714 | +6.0%  |
  | 160 (hard) | 0.882 | 0.873 | +2.2%  |

  Easy sessions are most sensitive because the resting-HR term is a larger fraction of the reserve. A too-high assumed resting HR systematically inflates easy-session load and therefore CTL.
- **Worth fixing?** Yes, but it is a **data** fix (measure resting HR), not a code change. Highest aggregate accuracy impact. Until measured, treat CTL/ATL absolute levels as approximate; trends are fine because the bias is roughly constant.

### (e) rTSS without grade adjustment (no NGP)
- **What we do:** IF = thresholdPace / flat average pace. No grade adjustment, no pacing normalization.
- **Divergence from TrainingPeaks:** TrainingPeaks rTSS uses NGP (grade-adjusted and pacing-normalized). A hilly run at a given average pace should score higher than the flat equivalent; ours does not. Using flat average pace also underestimates variable-pace runs (Jensen's inequality, same reason NP > avg power).
- **Effect:** underestimates load on hilly/trail and surging runs; accurate on flat steady runs (Jundiai HM IF 0.964 looks right). Direction is always "too low" for hilly/variable.
- **Worth fixing?** Medium, but data-gated. True NGP needs per-second pace plus grade streams; a partial "normalized running pace" (running analog of NP) needs per-second pace. Streams are fetched lazily today (only for race analysis), so a full backfill is rate-limited. Reasonable to defer and document.

### (f) TSB timing detail
- **What we do:** `tsb = prevCtl - prevAtl` (yesterday's CTL minus yesterday's ATL); first-day special-cased to 0 (redundant, since seeds are 0).
- **Divergence:** none. This matches the TrainingPeaks definition verbatim. Some platforms use same-day `CTL - ATL`; we correctly do not. No action.

### (g) Zone model and IF clamps
- **Zones:** Friel %LTHR cut points, a mainstream and internally consistent choice. Note our hrTSS uses Karvonen HRR while our zones use %LTHR; they are two different anchorings living side by side. Not wrong, but worth being aware the load model and the zone model use different HR references.
- **IF clamps (1.6 power, 1.5 pace, 1.5 HR):** TrainingPeaks does not clamp IF. Our clamps guard the quadratic against runaway on short, very intense, or noisy activities. They do not bite normal endurance sessions (a threshold HM sits near IF 0.96). Minor, defensible divergence. Only affects very short/intense or bad-data activities.
- **RPE fallback (linear, x0.25):** maps session-RPE onto the TSS scale (RPE 10 x 60 min = 150). It is linear in RPE while true TSS is quadratic in intensity, so it is a rough subjective proxy, which is appropriate for a last-resort method. Fine as is.
- **hrTSS from average HR, not stream:** underestimates interval/variable HR sessions (square-of-mean < mean-of-squares). This is a data limitation (`computeLoad` only sees `avg_hr`). TrainingPeaks' own average-HR fallback has the same property. Acceptable; a stream-integrated hrTSS would be more accurate but needs HR streams.

---

## 6. How the broader recovery ecosystem models this (context for the recovery feature)

All of these track the same fitness/fatigue/form idea; they differ in the load currency and in how much physiology (HRV, sleep, VO2max) they fold in.

- **TrainingPeaks / intervals.icu / GoldenCheetah:** load = TSS (or TRIMP), fitness = CTL, fatigue = ATL, form = TSB, EWMA with tc 42/7. intervals.icu is open and explicitly mirrors TrainingPeaks (it renames TSS/CTL/ATL/TSB to Load/Fitness/Fatigue/Form and uses the same 42/7 defaults, user-adjustable), which makes it the most useful cross-check for our numbers. GoldenCheetah uses the exact Form B exponential. These are the closest analogs to our engine.

- **Garmin / Firstbeat:** the load currency is **EPOC** (excess post-exercise oxygen consumption), not TSS. **Acute Load** = weighted sum of EPOC over ~7 days; **Chronic Load** = ~28-day (4-week) average. **Training Status** comes from the acute-to-chronic load ratio combined with the **VO2max** trend (estimated from HR vs pace/power) and **HRV Status**. **Training Load Focus** buckets recent load into low-aerobic / high-aerobic / anaerobic. **Body Battery** and **Training Readiness** are recovery-side scores blending HRV, sleep, stress, and acute load (high acute load suppresses readiness even with good sleep). So Garmin adds real physiology (HRV, sleep, VO2max) on top of an acute/chronic structure that is conceptually the same as CTL/ATL.

- **COROS EvoLab:** **Base Fitness** = exponentially weighted training load over ~6 weeks (a CTL analog), **Load Impact / Training Load** = 7-day exponentially weighted load (an ATL analog), plus a **Recovery Timer** (counts down to full recovery, capped at 96 h, from marathon level, load, and running efficiency). Same EWMA skeleton as the PMC, different names, running-power-flavoured load.

- **Stryd (running power):** **Running Stress Score (RSS)** is the power-based running load, `RSS = 100 x duration x (Power / CP)^K` (per-second `a x (P/CP)^b`), anchored to **Critical Power** instead of threshold pace. This is the running-load "gold standard" our pace-based rTSS approximates; because it uses mechanical power it captures grade and wind that flat pace misses, and it is the direction NGP-based rTSS is reaching toward.

Where they agree: an acute (~7 day) and chronic (~28 to 42 day) exponentially weighted load, and freshness as the balance between them. Where they differ from us: Garmin and COROS add HRV/sleep/recovery-time and estimate VO2max, none of which the PMC (or our engine) models. If Training Hub adds a recovery/readiness feature, the honest framing is that CTL/ATL/TSB answer "how much have you trained and how fresh is your load balance," while readiness answers "how recovered is your body today," and the second needs HRV/sleep/resting-HR data we do not currently ingest.

---

## 7. Prioritized recommendations

Ranked by precision impact divided by effort. "Rewrites history" flags changes that alter stored/displayed historical numbers and so need a deliberate recompute and a note to the user.

1. **Gate the power method on real power.** In `computeLoad` (`src/lib/fitness.ts`, power branch), require `rideMetrics(...).hasRealPower === true` before using `normalizedPower ?? avgPower`; otherwise fall through to HR. Fixes the estimated-power-as-power bug (gap c). Low effort, clear correctness win. Rewrites history for the affected subset of the 40 power rides (recompute loads). Also revisit the provisional FTP (150 W) before trusting any power TSS.

2. **Measure resting HR (data, not code).** Replace the assumed 50 bpm in `athlete_thresholds`. Biggest aggregate accuracy lever because HR drives 857/1230 loads (gap d). No code change; recomputing loads will shift CTL/ATL levels, most on easy sessions. Rewrites history (expected and correct).

3. **Add NGP / grade adjustment to rTSS (data-gated).** Requires per-second pace and grade streams (currently only fetched for race analysis). Medium effort, real accuracy gain on hilly/variable runs (gap e). Defer until streams are backfilled; document the current flat-pace limitation in the UI meanwhile. Rewrites history for runs when enabled.

4. **Decide and document the EWMA form (gap a).** Keep Form A (`1/42`, `1/7`) as the deliberate, Coggan-aligned choice, or switch to Form B (`1 - e^(-1/tc)`) to match GoldenCheetah/intervals.icu. Recommendation: keep Form A and add a one-line code comment citing that it is Coggan's original and that Form B differs by ~1% (CTL) to ~7% (ATL) in transient only. If you ever switch, it rewrites every historical PMC point.

5. **Handle the seeding artifact (cosmetic).** Either seed the first ~42 days with a small nonzero CTL/ATL estimate or trim the first 6 weeks from the displayed curve (gap b). Today's numbers are unaffected; this only cleans up early history. Low priority.

6. **When the per-activity coach analyses old activities, compute PMC as-of that date** (already flagged in PROGRESS.md as a known refinement). This interacts with the seeding artifact for very early activities; do (5) first if you do this.

7. **Optional: special-case swim TSS** to cube IF rather than square it (Section 2.6) if swim volume grows. Currently swims fall to HR/RPE, so low priority.

Do not change: the quadratic TSS (`hours x IF^2 x 100`, correct), the IF definition, VI, the TSB "yesterday" timing, and the Friel zone cut points. These already match the authoritative definitions.

---

## 8. Sources (grouped by trust)

**Official TrainingPeaks (primary for TSS/NP/IF/CTL/ATL/TSB and the PMC science):**
- The Science of the TrainingPeaks Performance Manager (Coggan): https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/
- What is the Performance Management Chart: https://www.trainingpeaks.com/learn/articles/what-is-the-performance-management-chart/
- An Introduction to TrainingPeaks Metrics: https://www.trainingpeaks.com/learn/articles/an-introduction-to-trainingpeaks-metrics/
- Running Training Stress Score (rTSS) Explained: https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/
- What is Normalized Graded Pace: https://www.trainingpeaks.com/learn/articles/what-is-normalized-graded-pace/
- Calculating Swimming TSS: https://www.trainingpeaks.com/learn/articles/calculating-swimming-tss-score/
- Training Stress Scores (TSS) Explained (help center): https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained
- Fitness (CTL) help center article: https://help.trainingpeaks.com/hc/en-us/articles/204071884-Fitness-CTL (returned HTTP 403 to automated fetch; content corroborated via the PMC and Science articles above)
- Understanding Normalized Power (coach blog): https://www.trainingpeaks.com/coach-blog/normalized-power-how-coaches-use/

**Peer-reviewed / academic (Banister lineage and critiques):**
- Morton, Fitz-Clarke, Banister (1990), Modeling human performance in running, J Appl Physiol 69(3):1171-1177.
- Banister, Calvert, Savage, Bach (1975/1976), A systems model of the effects of training on physical performance, IEEE Trans SMC.
- Busso (2003), Variable dose-response relationship between exercise training and performance, MSSE.
- Assessing the limitations of the Banister model in monitoring training (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC1974899/
- The Fitness-Fatigue Model: What's in the Numbers?, IJSPP 17(5), 2022: https://journals.humankinetics.com/view/journals/ijspp/17/5/article-p810.xml
- Is Running Power a Useful Metric (Stryd near MLSS), PMC: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10649254/

**Coaching / community references (formula compilations and cross-checks):**
- Goossens, Formulas from "Training and Racing with a Power Meter" (Critical Powers, Medium): https://medium.com/critical-powers/formulas-from-training-and-racing-with-a-power-meter-2a295c661b46
- GoldenCheetah user group, ATL and CTL Calculation (Form A vs Form B, exp(-1/T)): https://groups.google.com/g/golden-cheetah-users/c/tlfIMDcJab4
- GoldenCheetah formula syntax docs: https://github.com/GoldenCheetah/GoldenCheetah/blob/master/doc/user/formula-syntax.txt
- paincave.io, CTL/ATL/TSB Explained: https://www.paincave.io/blog/ctl-atl-tsb-explained
- procyclingcoaching, Core TrainingPeaks Metrics: https://www.procyclingcoaching.com/post/core-trainingpeaks-metrics-fitness-form-fatigue
- procyclingcoaching, Fitness CTL calculator: https://www.procyclingcoaching.com/resources/fitness-ctl-calculator
- TrainerRoad, Normalized Power: https://www.trainerroad.com/blog/normalized-power-what-it-is-and-how-to-use-it/
- Fellrnr, TRIMP (Banister/Edwards/Lucia variants): https://fellrnr.com/wiki/TRIMP
- intervals.icu forum, Change fatigue (ATL) and fitness (CTL) factors: https://forum.intervals.icu/t/change-fatigue-atl-and-fitness-ctl-factors/300
- intervals.icu Fitness/Fatigue/Form chart: https://www.intervals.icu/features/fitness-chart/

**Vendor docs (recovery ecosystem):**
- Garmin Forerunner 265 owner's manual, Training Status: https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-44C7BB4B-EFF7-4A42-AC03-8A6AABB94807.html
- the5krunner, Firstbeat physiology insights: https://the5krunner.com/2019/09/09/garmin-fenix-6-firstbeat-insights/
- COROS EvoLab help center: https://support.coros.com/hc/en-us/articles/26485283220884-EvoLab
- COROS Recovery Timer widget: https://support.coros.com/hc/en-us/articles/4402922069780-Widgets-Recovery-Timer-EvoLab
- Stryd, Running Stress Score (RSS): https://help.stryd.com/en/articles/6879537-running-stress-score-rss
- Ron George, An Equation for Running Stress Score: http://www.georgeron.com/2017/08/an-equation-for-running-stress-score-rss.html

---

## Verification notes (adversarial cross-checks)

- **TSS formula** corroborated across Coggan compilation (Goossens), TrainingPeaks Introduction article, and TrainingPeaks TSS help article. All give `hours x IF^2 x 100` (equivalently `t x NP x IF / (FTP x 3600) x 100`). Our `tssFrom` matches exactly.
- **CTL smoothing constant** corroborated across four independent sources. Coggan's Form A (`1/tc`): procyclingcoaching, paincave (states it explicitly), GoldenCheetah group (Abou-Samra quoting Coggan). Form B (`1 - e^(-1/tc)`): GoldenCheetah group (Martinez, "GC uses exp(-1/T)"), the general EWMA literature. The two are distinct but converge to the same steady state. Our code uses Form A. Per-day weights computed directly: 0.023810 vs 0.023528 (tc 42), 0.142857 vs 0.133122 (tc 7). (Note: a preliminary estimate of 0.02347 / 0.13353 for Form B was checked and corrected to the exact 0.023528 / 0.133122.)
- **TSB "yesterday" definition** corroborated by two independent sources verbatim: TrainingPeaks PMC article ("subtracting yesterday's Fatigue from yesterday's Fitness") and paincave ("TSB = CTL (yesterday) - ATL (yesterday)"). Our code matches, and our own reference numbers (today CTL-ATL = -4.7 but reported TSB -5.3) independently confirm the yesterday convention is active.
- **Resting-HR sensitivity** computed directly, not sourced (Section 5d table).
- **Steady-state equivalence** of Form A and Form B verified by direct iteration (400 days constant load, both converge to the input).
- Unresolved: no source gives TrainingPeaks' current production code, so whether TrainingPeaks today runs Form A or Form B is not provable from public docs. Coggan's published formula is Form A; GoldenCheetah and (by strong implication) intervals.icu use Form B. Stated honestly rather than guessed.
