# Garmin sync service

A **standalone** daily job that pulls health metrics from Garmin Connect and
POSTs them to the Training Hub app's ingest endpoint. It is fully decoupled: the
Next.js app never imports this folder and builds/tests without it. Garmin
credentials live only here (GitHub Actions secrets), never in the app or repo.

See `../../docs/health-readiness/RESEARCH_GARMIN_LIBS.md` for the library choice
and the auth reality (unofficial API, TLS fingerprinting, MFA).

## What it does

1. Logs in to Garmin Connect via `python-garminconnect` (reusing a cached OAuth
   token; a full login is needed only once, for MFA).
2. Fetches a trailing window (default 3 days, 5 in CI) so late-finalizing
   overnight data backfills.
3. Normalizes each day to the app's source-agnostic ingest contract and POSTs it
   to `POST /api/health/ingest` with the shared `HEALTH_INGEST_SECRET` token.

Per-metric fetches degrade to "field omitted" on failure; only a login or an
ingest failure exits non-zero (so the cron alerts). The app always works with
stale or absent health data.

## Environment

| Var | Required | Notes |
|---|---|---|
| `INGEST_URL` | yes | e.g. `https://<app>/api/health/ingest` |
| `HEALTH_INGEST_SECRET` | yes | Must equal the app's `HEALTH_INGEST_SECRET` |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | login only | Not needed with a cached token or `SYNC_MOCK=1` |
| `GARMINTOKENS` | no | Token cache dir (default `~/.garminconnect`) |
| `SYNC_DAYS` | no | Trailing days to fetch (default 3) |
| `SYNC_MOCK` | no | `1` posts the bundled `mock-snapshot.json` and exits |

## One-time setup (the single manual step)

Garmin's first login needs an MFA code, which cannot run headless. Do it once
locally to produce a cached token, then hand the token to GitHub Actions.

```bash
cd services/garmin-sync
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Interactive login (prompts for the MFA code). Writes the token to ~/.garminconnect.
GARMIN_EMAIL="you@example.com" GARMIN_PASSWORD="…" \
INGEST_URL="https://<app>/api/health/ingest" \
HEALTH_INGEST_SECRET="<same as the app>" \
python sync.py
```

Then package the cached token as a base64 tar and store it as the
`GARMIN_TOKEN_B64` repo secret:

```bash
tar -czC "$HOME/.garminconnect" . | base64 | pbcopy   # macOS; use `| xclip` on Linux
```

### GitHub Actions secrets to set

- `GARMIN_TOKEN_B64` — the base64 tar above (refresh if the token expires/revokes)
- `INGEST_URL`, `HEALTH_INGEST_SECRET`
- `GARMIN_EMAIL`, `GARMIN_PASSWORD` — fallback for a re-login (still needs MFA if
  the refresh token is dead; watch for a failing run and refresh the token secret)

The workflow (`.github/workflows/garmin-sync.yml`) runs daily at 12:00 UTC
(09:00 America/Sao_Paulo) and on manual dispatch.

## Test the pipeline without Garmin (mock mode)

Validates ingest -> app end to end using bundled sample data — no Garmin creds:

```bash
SYNC_MOCK=1 \
INGEST_URL="http://localhost:3000/api/health/ingest" \
HEALTH_INGEST_SECRET="<same as the app>" \
python sync.py
```

The mock snapshot lands on today's date; open `/health` in the app to see it.

## When the owner is back (real flow)

Run the one-time interactive login above with real credentials, seed the
`GARMIN_TOKEN_B64` secret, then trigger the workflow (`workflow_dispatch`) once
to confirm a real day ingests. After that it runs unattended.
