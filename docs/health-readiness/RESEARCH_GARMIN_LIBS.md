# Garmin Connect Libraries for a Decoupled Daily Health Sync

Research date: 2026-07-23. Read-only research. Use case: pull a daily morning health/recovery
snapshot for one athlete (Forerunner 965) and push it into a private Next.js 16 / TS training log
on Vercel. The Garmin sync must run as a SEPARATE scheduled service, not inside the Vercel app.

## 1. TL;DR recommendation

Use **cyberjunky/python-garminconnect** as a standalone daily Python job (GitHub Action on a cron,
or a small always-on box), authenticating once with credentials + MFA, persisting the token file,
normalizing the response to a generic health-metrics JSON, and POSTing it to an ingest endpoint on
the app. Reasons: it is the only option with full coverage of the wishlist (sleep + stages, HRV
overnight + status, RHR, stress, Body Battery, respiration, SpO2, steps, training readiness AND
training status), it is by far the best maintained (2.7k stars, active releases through June 2026),
and critically it is one of the few libraries that survived the March 2026 Garmin auth break by
rebuilding its login on `curl_cffi` (TLS impersonation of the Android app). MIT licensed. It fits
the decoupled model cleanly: the app never sees Garmin credentials or Garmin-specific field shapes.

Secondary option, only if you specifically want a JS/TS runtime or a live MCP tool for the AI coach
rather than a stored daily snapshot: **etweisberg/garmin-connect-mcp** (TypeScript, Playwright-based).
It also works post-break (it inherits a real Chrome TLS fingerprint via headless Chromium) and has
broad coverage, but it is heavier (bundles Chromium), AGPL-3.0, and shaped as an MCP server rather
than a sync-and-store job. Since the requirement is a daily snapshot for trend charts, the
sync-and-store model wins over live MCP, so python-garminconnect is the primary pick and MCP is a
"nice to have" you can add later pointing at the same stored data.

Avoid: garmy (garth-based, unmaintained since mid-2025, almost certainly broken by the March 2026
change), santoshyadavdev/garmin-api (thin unmaintained FastAPI wrapper over python-garminconnect,
adds nothing), kacirekj/garmin-api (Java, abandoned, 2 metrics only), and building anything new on
garth (deprecated). The stale but popular JS library Pythe1337N/garmin-connect is also out: no recent
maintenance, no fix for the TLS break, MFA unimplemented, and missing most recovery metrics.

## 2. Comparison table

| Library | Lang / runtime | Maintenance | Auth mechanism | Works post Mar-2026 break? | Coverage vs wishlist | MCP / agent | License | Decoupled fit |
|---|---|---|---|---|---|---|---|---|
| **cyberjunky/python-garminconnect** | Python 3 | Very active. 2.7k stars, ~3 open issues, v0.3.6 (Jun 14 2026) | Mobile SSO via `curl_cffi` TLS impersonation; MFA via `prompt_mfa` callback; tokens cached at `~/.garminconnect/garmin_tokens.json` with auto-refresh; self-healing re-login | Yes. Rebuilt login on curl_cffi in v0.3.5+ | Full: sleep+stages, HRV overnight+status, RHR, stress, Body Battery, respiration, SpO2, steps, training readiness, training status | No native MCP, but trivial to wrap | MIT | Excellent. Standalone script/cron/Action that POSTs JSON |
| **bes-dev/garmy** | Python 3.8+ | Inactive since mid-2025. 65 stars, 9 open issues, v1.0.0 (Jun 2 2025) | `AuthClient` email/password built on **garth** | Very likely broken. garth deprecated; no post-break commits | Sleep, HR, stress, Body Battery, training readiness, steps. HRV/respiration/SpO2 not listed | Yes, ships `garmy-mcp` server + local SQLite + `garmy-sync` | Apache-2.0 | Moderate in theory, but blocked by broken auth |
| **santoshyadavdev/garmin-api** | Python (FastAPI) | Low. 29 stars, 3 open issues, ~19 commits | Inherits python-garminconnect (ported) | Only if it tracks upstream; not maintained to | Whatever it exposes of python-garminconnect (partial) | No | MIT | Poor. Redundant wrapper; just use python-garminconnect directly |
| **kacirekj/garmin-api** | Java | Abandoned. 4 stars, ~5 commits | Username/password, `GarminSession` serialized to JSON | Unknown, almost certainly broken | Minimal: daily user summary + heart rate only | No | Unspecified | Poor. Wrong runtime, near-zero coverage |
| **matin/garth** | Python | **DEPRECATED** (v0.8.0, Mar 28 2026). 815 stars | Garmin SSO, OAuth1 tokens, `dump`/`load` session | No for new logins; old saved OAuth1 tokens may last until expiry (~1yr) | Auth + some daily stats accessors | No | MIT | Do not build new on it |
| Pythe1337N/garmin-connect (npm `garmin-connect`) | TypeScript | Stale. 193 stars, 26 open issues, v1.6.2 (Jan 17 2024) | Credentials + OAuth1/2 token import/export; MFA is TODO; garth-inspired | Unlikely; no TLS-break fix, no recent activity | Partial: sleep, sleep duration, HR, steps, weight, hydration. Missing stress, Body Battery, HRV, RHR, respiration, SpO2, training readiness | No | MIT | Would integrate directly in Node, but not viable now |
| etweisberg/garmin-connect-mcp | TypeScript / Node 18+ | Active. 37 stars, 0 open issues, v0.1.23 (Jul 12 2026) | **Playwright headless Chromium**; manual login once, cookies+CSRF saved to `~/.garmin-connect-mcp/session.json`; all calls run inside browser via `page.evaluate(fetch)` to inherit Chrome TLS | Yes. Browser TLS bypasses the Cloudflare fingerprinting | Broad: 27 tools incl sleep, Body Battery, HRV, training readiness, steps, stress, respiration, activities | Yes, is an MCP server (stdio) | AGPL-3.0 | Good but heavy (needs Chromium); MCP-shaped, not snapshot-shaped |

Notable context, not evaluated in depth:
- **garmin-grafana** (Python, 3.4k stars, most-starred in the topic): a Dockerized daily fetcher that
  writes Garmin health data into InfluxDB for Grafana. It is exactly the decoupled-daily-sync pattern
  we want, built on python-garminconnect / garth internals. Good reference implementation even though
  it targets InfluxDB rather than a custom ingest endpoint.
- **marcel-tuinstra/garmin-connect-sdk** (Node 24+, TS, MIT): newer read-first SDK, "daily sleep,
  sleep ranges, heart rate, stress, HRV, Body Battery," MFA + token storage. v1.0.0 Jul 18 2026, but
  only 2 stars and no visible track record of responding to Garmin changes. One to watch, too new to
  rely on.
- **garmin-connect** (Go, 153 stars): a Go client, out of scope for our stack.

## 3. Auth and security reality, risks, and mitigation

There is no open consumer API. Every option here logs in with your real Garmin Connect credentials
through Garmin's SSO and then calls the internal `connect.garmin.com` endpoints that the web and
mobile apps use. That is unsupported and can break at any time. Concrete realities as of mid-2026:

- **garth was the shared foundation and is now deprecated** (final v0.8.0, Mar 28 2026, 350k+ monthly
  downloads at its peak). Most Python and several JS libraries were built on its SSO/OAuth1 flow.
- **March 2026 Garmin change: Cloudflare TLS fingerprinting.** Garmin now blocks non-browser HTTP
  clients (Node `fetch`, Python `requests`, `curl`) with a 403 based on TLS fingerprint. This broke
  garth, older python-garminconnect, and the plain-HTTP JS libraries at the same time.
- **Two working answers emerged.** (a) `curl_cffi`, which impersonates the Android app's TLS
  fingerprint. python-garminconnect adopted this in v0.3.5 (Jun 4 2026) and works again, with MFA via
  a callback and local token caching. (b) A real browser: garmin-connect-mcp runs every request
  inside headless Chromium so it carries a genuine Chrome TLS stack.
- **MFA / 2FA.** If your Garmin account has 2FA enabled, the login needs a one-time code.
  python-garminconnect handles this with a `prompt_mfa` callback you supply; garmin-connect-mcp
  handles it by doing the login interactively once in a browser. Some libraries (the stale JS one)
  do not implement MFA at all.
- **Token / session persistence.** python-garminconnect writes OAuth tokens to
  `~/.garminconnect/garmin_tokens.json` (mode 0600) and auto-refreshes before expiry, so after the
  first interactive login the daily job runs unattended until the refresh token expires or is
  revoked. garmin-connect-mcp persists browser cookies + CSRF to a session file.
- **Official Garmin Health API / Connect Developer Program.** It exists and is the "correct" path,
  but it is not realistically available to an individual right now: it is oriented at companies
  (company-domain email, commercial use, some metrics gated behind license fees or minimum device
  orders), and the program is reported to be on hold / suspended to new applicants. Do not plan
  around it for a single-user hobby project.

Risks and how to mitigate for a single user:
- **Credential storage.** The sync service, not the Vercel app, holds the Garmin email/password and
  the token file. Keep credentials in the sync host's secret store (GitHub Actions encrypted
  secrets, or env vars on the box). Never put Garmin creds in the Next.js app or its serverless env.
  Persist the token file so you only type the MFA code on first run and after token expiry.
- **Account blocking / rate limits.** These are internal endpoints with no published limits. Pull
  once per day, sequentially, with a small delay between calls, and do not backfill aggressively.
  A single daily snapshot for one athlete is low risk. Reuse the cached token; do not re-login every
  run (repeated logins are the main trigger for lockouts).
- **The TLS impersonation is a cat-and-mouse game.** Garmin could break curl_cffi again. Pin the
  library version, alert on repeated auth failures, and keep the Playwright/browser approach as a
  documented fallback (more robust to fingerprinting, heavier to run).
- **ToS.** Automated scraping of the private API is not sanctioned by Garmin. For private,
  single-user, personal-data use this is low practical risk, but it is technically against their
  terms and can be cut off without notice. Treat the feed as best-effort, not guaranteed.
- **Decouple to contain the blast radius.** Because the app ingests a generic normalized JSON, a
  Garmin-side break only takes down the sync job. The app keeps serving the last stored snapshot and
  its trend charts.

## 4. Health metrics we can realistically get, with Garmin endpoints/fields

Endpoint paths below are the internal Connect endpoints (verified from python-garminconnect source).
Field names are the commonly returned Connect JSON fields; exact shapes vary by firmware/version, so
normalize defensively.

- **Sleep + stages** - `get_sleep_data(date)` -> `GET /wellness-service/wellness/dailySleepData/{displayName}`.
  Fields under `dailySleepDTO`: `sleepTimeSeconds` (total), `deepSleepSeconds`, `lightSleepSeconds`,
  `remSleepSeconds`, `awakeSleepSeconds`, `sleepStartTimestampGMT`/`Local`, `sleepEndTimestamp...`,
  `sleepScores.overall.value`. Overnight SpO2 / respiration / HRV are also mirrored here
  (`averageSpO2Value`, `averageRespirationValue`, `avgOvernightHrv`, `hrvStatus`).
- **HRV overnight + status/baseline** - `get_hrv_data(date)` -> `GET /hrv-service/hrv/{date}`.
  Fields under `hrvSummary`: `lastNightAvg` (overnight avg ms), `lastNight5MinHigh`, `weeklyAvg`,
  `status` (BALANCED / UNBALANCED / LOW / POOR), `baseline.{lowUpper, balancedLow, balancedUpper,
  markerValue}`. Plus `hrvReadings[]` time series.
- **Resting heart rate** - `get_rhr_day(date)` -> `GET /userstats-service/wellness/daily/{displayName}`
  with `metricId=60`; also present as `restingHeartRate` in the daily stats and heart-rate responses
  (`get_heart_rates`, `get_stats`).
- **Stress** - `get_all_day_stress(date)` -> `GET /wellness-service/wellness/dailyStress/{date}`.
  Fields: `avgStressLevel`, `maxStressLevel`, `stressValuesArray` (time series), plus rest/activity
  buckets. Daily stats also carry `averageStressLevel`.
- **Body Battery (low/high)** - `get_body_battery(start, end)` ->
  `GET /wellness-service/wellness/bodyBattery/reports/daily`; the values array yields the day's low
  and high, plus `charged`/`drained`. Daily stats expose `bodyBatteryHighestValue`,
  `bodyBatteryLowestValue`, `bodyBatteryMostRecentValue`.
- **Respiration** - `get_respiration_data(date)` -> `GET /wellness-service/wellness/daily/respiration/{date}`.
  Fields: `avgWakingRespirationValue`, `avgSleepRespirationValue`, `lowestRespirationValue`,
  `highestRespirationValue`, plus a values array.
- **SpO2 / pulse ox** - `get_spo2_data(date)` -> `GET /wellness-service/wellness/daily/spo2/{date}`.
  Fields: `averageSpO2`, `lowestSpO2`, `latestSpO2`, plus a values array.
- **Steps** - `get_daily_steps(start, end)` -> `GET /usersummary-service/stats/steps/daily/{start}/{end}`;
  `totalSteps` and `stepGoal`/`dailyStepGoal`. Daily stats also carry `totalSteps`.
- **Training Readiness** - `get_training_readiness(date)` / `get_morning_training_readiness(date)`
  -> `GET /metrics-service/metrics/trainingreadiness/{date}`. Fields: `score` (0-100), `level`,
  `feedbackShort`/`feedbackLong`, `sleepScore`, `hrvFactorPercent`, `recoveryTime`, `acuteLoad`.
- **Training Status** - `get_training_status(date)` ->
  `GET /metrics-service/metrics/trainingstatus/aggregated/{date}`. Fields include the training status
  label (PRODUCTIVE / MAINTAINING / RECOVERY / DETRAINING / OVERREACHING / etc.), `vo2Max`,
  acute/chronic load, and load-balance data.

All ten wishlist items are obtainable from python-garminconnect for a single athlete on a
Forerunner 965. Training Readiness and Training Status are Garmin-computed and do come through these
metrics-service endpoints, which not all libraries wrap (python-garminconnect does).

## 5. Minimal integration sketch (decoupled daily sync)

Keep Garmin specifics entirely inside the sync service. The app exposes one ingest endpoint that
accepts a generic, source-agnostic health snapshot. If you later add a second source (Oura, Whoop,
manual), it writes the same shape and the app does not change.

App side, generic contract (the app knows nothing about Garmin):

```jsonc
// POST /api/ingest/health-snapshot   (Bearer INGEST_TOKEN)
{
  "date": "2026-07-23",          // local calendar date of the snapshot
  "source": "garmin",
  "sleep":       { "totalMin": 452, "deepMin": 78, "lightMin": 250, "remMin": 96, "awakeMin": 28, "score": 82 },
  "hrv":         { "overnightAvgMs": 61, "status": "BALANCED", "baselineLowMs": 48, "baselineHighMs": 68 },
  "restingHr":   47,
  "stress":      { "avg": 28, "max": 91 },
  "bodyBattery": { "low": 24, "high": 96 },
  "respiration": { "avgSleep": 13.2, "avgWaking": 15.1, "low": 11, "high": 19 },
  "spo2":        { "avg": 95, "low": 90 },
  "steps":       9432,
  "trainingReadiness": { "score": 74, "level": "HIGH", "recoveryTimeHrs": 11 },
  "trainingStatus":    { "status": "PRODUCTIVE", "vo2Max": 58 },
  "raw": { /* optional: stash the untouched Garmin payloads for later reprocessing */ }
}
```

Sync side, standalone Python (runs as a GitHub Action cron, or on any small always-on host). Nothing
here lives in Vercel:

```python
# garmin_sync.py  -- pip install garminconnect requests
import os, datetime as dt, requests
from garminconnect import Garmin

def get_mfa():                      # only prompted on first login; token file persists after
    return input("Garmin MFA code: ")

def to_min(seconds):
    return round((seconds or 0) / 60)

def main():
    tokenstore = os.path.expanduser("~/.garminconnect")
    try:                            # reuse cached OAuth tokens; auto-refresh handles expiry
        g = Garmin()
        g.login(tokenstore)
    except Exception:               # first run / expired refresh token -> full login + MFA
        g = Garmin(os.environ["GARMIN_EMAIL"], os.environ["GARMIN_PASSWORD"],
                   prompt_mfa=get_mfa)
        g.login()
        g.garth.dump(tokenstore)

    d = (dt.date.today() - dt.timedelta(days=0)).isoformat()   # or yesterday for a full night
    sleep = g.get_sleep_data(d).get("dailySleepDTO", {}) or {}
    hrv   = (g.get_hrv_data(d) or {}).get("hrvSummary", {}) or {}
    rhr   = g.get_rhr_day(d)
    stress = g.get_all_day_stress(d) or {}
    bb    = g.get_body_battery(d, d)          # extract low/high from values array
    resp  = g.get_respiration_data(d) or {}
    spo2  = g.get_spo2_data(d) or {}
    tr    = g.get_training_readiness(d) or {}
    ts    = g.get_training_status(d) or {}

    snapshot = {
        "date": d, "source": "garmin",
        "sleep": {
            "totalMin": to_min(sleep.get("sleepTimeSeconds")),
            "deepMin":  to_min(sleep.get("deepSleepSeconds")),
            "lightMin": to_min(sleep.get("lightSleepSeconds")),
            "remMin":   to_min(sleep.get("remSleepSeconds")),
            "awakeMin": to_min(sleep.get("awakeSleepSeconds")),
            "score":    (sleep.get("sleepScores", {}).get("overall", {}) or {}).get("value"),
        },
        "hrv": {
            "overnightAvgMs": hrv.get("lastNightAvg"),
            "status":         hrv.get("status"),
            "baselineLowMs":  (hrv.get("baseline") or {}).get("balancedLow"),
            "baselineHighMs": (hrv.get("baseline") or {}).get("balancedUpper"),
        },
        "restingHr": rhr if isinstance(rhr, int) else (rhr or {}).get("restingHeartRate"),
        "stress":    {"avg": stress.get("avgStressLevel"), "max": stress.get("maxStressLevel")},
        # bodyBattery/respiration/spo2/steps/trainingReadiness/trainingStatus: map the same way
        "trainingReadiness": {"score": tr.get("score"), "level": tr.get("level")},
        "trainingStatus":    {"status": ts.get("latestTrainingStatus")},
    }

    r = requests.post(
        os.environ["INGEST_URL"],
        headers={"Authorization": f"Bearer {os.environ['INGEST_TOKEN']}"},
        json=snapshot, timeout=30,
    )
    r.raise_for_status()

if __name__ == "__main__":
    main()
```

Operational notes:
- First run is interactive (login + MFA), which writes the token file. After that the cron runs
  unattended. On GitHub Actions, seed the token file from an encrypted secret, or run first login
  locally and commit the token to the runner's secret store (never to the repo).
- Schedule mid-morning local time so the prior night's sleep/HRV/readiness are finalized. Query
  "yesterday" if you run very early.
- The app validates the Bearer token, upserts by `date` + `source`, and stores `raw` for later
  reprocessing. Trend charts read the normalized columns only. The AI coach reads the same normalized
  rows, so it never needs Garmin-specific knowledge.
- If you also want the coach to query Garmin live, add garmin-connect-mcp later as an optional MCP
  server. It does not replace the daily snapshot; it complements it.

## 6. Sources

- https://github.com/cyberjunky/python-garminconnect
- https://github.com/cyberjunky/python-garminconnect/issues/332 (auth change reported)
- https://github.com/cyberjunky/python-garminconnect/issues/349 (garth error)
- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/__init__.py (methods + endpoints)
- https://github.com/bes-dev/garmy
- https://github.com/bes-dev/garmy/commits
- https://github.com/santoshyadavdev/garmin-api
- https://github.com/kacirekj/garmin-api
- https://github.com/matin/garth
- https://github.com/matin/garth/discussions/222 (deprecation announcement)
- https://garth.readthedocs.io/
- https://github.com/topics/garmin-connect
- https://github.com/Pythe1337N/garmin-connect
- https://www.npmjs.com/package/garmin-connect
- https://github.com/etweisberg/garmin-connect-mcp
- https://www.npmjs.com/package/@etweisberg/garmin-connect-mcp
- https://github.com/marcel-tuinstra/garmin-connect-sdk
- https://www.getvertical.ai/blog/chatgpt-garmin-integration/ (2026 auth-break writeup)
- https://developer.garmin.com/gc-developer-program/health-api/ (official Health API)
- https://developer.garmin.com/gc-developer-program/program-faq/ (program FAQ)
- https://www.spikeapi.com/blog/why-integrate-garmin-api-directly (developer program status/notes)
