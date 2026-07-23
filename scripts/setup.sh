#!/usr/bin/env bash
# Guided first-time setup for a Training Hub instance.
#   npm run setup   (or: bash scripts/setup.sh)
#
# It creates .env.local, helps you fill Strava keys, generates the auth + health
# secrets, installs deps, and prints the remaining steps. Safe to re-run: it
# only overwrites a value when you type a new one.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }

ENV=".env.local"

# Set KEY=VALUE in .env.local (replacing any existing line for that key).
set_env() {
  local key="$1" val="$2"
  touch "$ENV"
  grep -v "^${key}=" "$ENV" >"${ENV}.tmp" 2>/dev/null || true
  echo "${key}=${val}" >>"${ENV}.tmp"
  mv "${ENV}.tmp" "$ENV"
}

current() { grep "^$1=" "$ENV" 2>/dev/null | head -1 | cut -d= -f2- || true; }

rand() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else
    head -c 32 /dev/urandom | xxd -p -c 32
  fi
}

say "Training Hub setup"
if [ ! -f "$ENV" ]; then
  cp .env.example "$ENV"
  info "Created $ENV from .env.example"
else
  info "$ENV already exists — will only change what you answer"
fi

say "1) Strava (activity sync). Create an app at https://www.strava.com/settings/api"
info "Authorization Callback Domain: localhost (dev) or your deployed domain."
read -r -p "  Strava Client ID (blank to skip): " SCID
[ -n "$SCID" ] && set_env STRAVA_CLIENT_ID "$SCID"
read -r -p "  Strava Client Secret (blank to skip): " SCS
[ -n "$SCS" ] && set_env STRAVA_CLIENT_SECRET "$SCS"

say "2) Owner login (auth). Leave the password blank to keep auth DISABLED (local only)."
read -r -p "  Owner password (blank to skip): " OWNERPW
if [ -n "$OWNERPW" ]; then
  set_env AUTH_PASSWORD "$OWNERPW"
  if [ -z "$(current AUTH_SECRET)" ]; then
    set_env AUTH_SECRET "$(rand)"
    info "Generated AUTH_SECRET"
  fi
fi

say "3) Health ingest secret (for the Garmin/wearable sync -> /api/health/ingest)"
if [ -z "$(current HEALTH_INGEST_SECRET)" ]; then
  set_env HEALTH_INGEST_SECRET "$(rand)"
  info "Generated HEALTH_INGEST_SECRET (use the same value in the sync service)"
else
  info "HEALTH_INGEST_SECRET already set — keeping it"
fi

say "4) Dependencies"
if [ ! -d node_modules ]; then
  info "Installing npm packages…"
  npm install
else
  info "node_modules present — skipping npm install"
fi

say "Done. Next steps:"
info "• Start the app:            npm run dev   → http://localhost:3000"
info "• Connect Strava:           open /settings and click Connect"
info "• Enable the wearable sync: services/garmin-sync/ (see its README; run its setup.local.sh)"
info "• Deploy your own instance: see the Deploy section in README.md"
info ""
info "Your secrets are in $ENV (gitignored). For production, set the same"
info "STRAVA_*, AUTH_*, HEALTH_INGEST_SECRET and TURSO_* vars in your host."
