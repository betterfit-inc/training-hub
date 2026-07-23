#!/usr/bin/env python3
"""Decoupled daily Garmin -> Training Hub health sync.

This is a STANDALONE service. The Next.js app never imports it and builds/tests
with zero awareness of it. It logs in to Garmin Connect (unofficial API via
cyberjunky/python-garminconnect), normalizes a trailing window of daily health
metrics into the app's source-agnostic ingest contract, and POSTs each day to
POST /api/health/ingest authenticated with a shared machine token.

Design notes:
- Garmin's API is unofficial and fragile (see ../../docs/health-readiness/
  RESEARCH_GARMIN_LIBS.md). Every per-metric fetch degrades to None on failure,
  so a firmware/endpoint change costs a field, not the whole run. But a LOGIN or
  an INGEST failure exits non-zero (loud) so the cron alerts.
- Auth: first login is interactive (MFA); the OAuth token is cached in
  GARMINTOKENS and reused unattended after that. On CI the token dir is seeded
  from a base64 secret (see README).
- A trailing window (default 3 days) is fetched every run so late-finalizing
  overnight data (sleep/HRV/readiness) backfills.
- SYNC_MOCK=1 posts a bundled mock snapshot instead of contacting Garmin, so the
  end-to-end ingest -> app pipeline can be validated without Garmin credentials.

Env:
  INGEST_URL             e.g. https://<app>/api/health/ingest   (required)
  HEALTH_INGEST_SECRET   shared bearer token, matches the app   (required)
  GARMIN_EMAIL           Garmin Connect login    (required unless SYNC_MOCK=1)
  GARMIN_PASSWORD        Garmin Connect password (required unless SYNC_MOCK=1)
  GARMINTOKENS           token cache dir (default ~/.garminconnect)
  SYNC_DAYS              trailing days to fetch (default 3)
  SYNC_MOCK              "1" to post the bundled mock snapshot and exit
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from pathlib import Path

import requests

SOURCE = "garmin"


def log(msg: str) -> None:
    print(f"[garmin-sync] {msg}", flush=True)


def fail(msg: str) -> "None":
    print(f"[garmin-sync] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def env(name: str, default: str | None = None, required: bool = False) -> str | None:
    value = os.environ.get(name, default)
    if required and not value:
        fail(f"missing required env var {name}")
    return value


def to_min(seconds: object) -> int | None:
    """Seconds -> whole minutes, or None for a missing/non-numeric value."""
    if not isinstance(seconds, (int, float)):
        return None
    return round(seconds / 60)


def num(value: object) -> float | int | None:
    return value if isinstance(value, (int, float)) else None


def safe(label: str, fn):
    """Run a Garmin fetch, returning None (and logging) instead of raising, so one
    bad endpoint never fails the whole day."""
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - best-effort per-metric fetch
        log(f"  {label} unavailable: {exc}")
        return None


def build_snapshot(garmin, date: str) -> dict:
    """Normalize one day's Garmin data into the app's generic ingest contract.

    Only the app-agnostic shape is produced here; the app maps it to
    health_metrics. Absent fields are simply omitted (the app NaN-guards too)."""
    sleep = (safe("sleep", lambda: garmin.get_sleep_data(date)) or {}).get("dailySleepDTO", {}) or {}
    hrv = (safe("hrv", lambda: garmin.get_hrv_data(date)) or {}).get("hrvSummary", {}) or {}
    rhr = safe("rhr", lambda: garmin.get_rhr_day(date))
    stress = safe("stress", lambda: garmin.get_all_day_stress(date)) or {}
    stats = safe("stats", lambda: garmin.get_stats(date)) or {}
    resp = safe("respiration", lambda: garmin.get_respiration_data(date)) or {}
    spo2 = safe("spo2", lambda: garmin.get_spo2_data(date)) or {}
    steps = safe("steps", lambda: garmin.get_daily_steps(date, date)) or []
    readiness = safe("training_readiness", lambda: garmin.get_training_readiness(date))
    status = safe("training_status", lambda: garmin.get_training_status(date)) or {}

    # get_training_readiness may return a list of entries; take the first.
    if isinstance(readiness, list):
        readiness = readiness[0] if readiness else {}
    readiness = readiness or {}

    resting_hr = rhr if isinstance(rhr, (int, float)) else None
    if resting_hr is None and isinstance(rhr, dict):
        resting_hr = num(rhr.get("restingHeartRate"))
    if resting_hr is None:
        resting_hr = num(stats.get("restingHeartRate"))

    total_steps = None
    if isinstance(steps, list) and steps:
        total_steps = num(steps[0].get("totalSteps"))
    if total_steps is None:
        total_steps = num(stats.get("totalSteps"))

    snapshot: dict = {
        "date": date,
        "source": SOURCE,
        "sleep": {
            "totalMin": to_min(sleep.get("sleepTimeSeconds")),
            "deepMin": to_min(sleep.get("deepSleepSeconds")),
            "lightMin": to_min(sleep.get("lightSleepSeconds")),
            "remMin": to_min(sleep.get("remSleepSeconds")),
            "awakeMin": to_min(sleep.get("awakeSleepSeconds")),
            "score": ((sleep.get("sleepScores", {}) or {}).get("overall", {}) or {}).get("value"),
        },
        "hrv": {
            "overnightAvgMs": num(hrv.get("lastNightAvg")),
            "status": hrv.get("status"),
        },
        "restingHr": resting_hr,
        "stress": {"avg": num(stress.get("avgStressLevel"))},
        "bodyBattery": {
            "low": num(stats.get("bodyBatteryLowestValue")),
            "high": num(stats.get("bodyBatteryHighestValue")),
        },
        "respiration": {
            "avgSleep": num(resp.get("avgSleepRespirationValue")),
            "avgWaking": num(resp.get("avgWakingRespirationValue")),
        },
        "spo2": {"avg": num(spo2.get("averageSpO2") or spo2.get("averageSpO2Value"))},
        "steps": total_steps,
        "trainingReadiness": {
            "score": num(readiness.get("score")),
            "level": readiness.get("level"),
            "recoveryTimeHrs": num(readiness.get("recoveryTime")),
        },
        "trainingStatus": {
            "status": status.get("latestTrainingStatus") or status.get("trainingStatus"),
        },
    }
    return snapshot


def post_snapshot(url: str, secret: str, snapshot: dict) -> None:
    res = requests.post(
        url,
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        json=snapshot,
        timeout=30,
    )
    if not res.ok:
        fail(f"ingest POST {res.status_code} for {snapshot['date']}: {res.text[:300]}")
    body = res.json() if res.content else {}
    log(f"  ingested {snapshot['date']}: {body.get('count', '?')} metrics")


def mock_snapshot() -> dict:
    path = Path(__file__).with_name("mock-snapshot.json")
    data = json.loads(path.read_text())
    # Stamp the mock onto today so it lands as a fresh day.
    data["date"] = dt.date.today().isoformat()
    return data


def login():
    """Import + authenticate lazily so --mock and -h work without the library."""
    from garminconnect import Garmin  # imported here so SYNC_MOCK needs no dep

    tokenstore = env("GARMINTOKENS", os.path.expanduser("~/.garminconnect"))
    try:
        garmin = Garmin()
        garmin.login(tokenstore)
        log("reused cached Garmin token")
        return garmin
    except Exception as exc:  # noqa: BLE001 - fall back to a full interactive login
        log(f"cached token unusable ({exc}); doing a full login")

    email = env("GARMIN_EMAIL", required=True)
    password = env("GARMIN_PASSWORD", required=True)

    def prompt_mfa() -> str:
        return input("Garmin MFA code: ")

    garmin = Garmin(email=email, password=password, prompt_mfa=prompt_mfa)
    garmin.login()
    garmin.garth.dump(tokenstore)
    log("logged in and cached a fresh token")
    return garmin


def main() -> None:
    url = env("INGEST_URL", required=True)
    secret = env("HEALTH_INGEST_SECRET", required=True)

    if env("SYNC_MOCK") == "1":
        log("SYNC_MOCK=1 — posting the bundled mock snapshot")
        post_snapshot(url, secret, mock_snapshot())
        log("done (mock)")
        return

    days = int(env("SYNC_DAYS", "3") or "3")
    garmin = login()

    today = dt.date.today()
    posted = 0
    for offset in range(days):
        date = (today - dt.timedelta(days=offset)).isoformat()
        log(f"fetching {date}")
        snapshot = build_snapshot(garmin, date)
        post_snapshot(url, secret, snapshot)
        posted += 1
    log(f"done: posted {posted} day(s)")


if __name__ == "__main__":
    main()
