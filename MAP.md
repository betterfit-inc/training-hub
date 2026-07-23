# Training Hub — module map

A private, single-user training/fitness log. Syncs activities from Strava, runs a review ritual (confirm activity, assign shoes/bikes + splits + RPE/feeling/notes), tracks per-shoe/per-bike mileage, computes its own fitness picture (per-activity training load, then a CTL/ATL/TSB Performance Management Chart), compares race blocks, and offers an AI coach.

Keep this map current: update it in the same change that moves or rewires a module (G13.1).

## Entry points

- `src/app/layout.tsx` — root RSC shell: fonts, `force-dynamic`, theme + i18n providers, header, toaster, Speed Insights.
- Pages (async RSC, no page-level `"use client"`): `/` (log) · `/review` · `/activity/[id]` · `/fitness` · `/insights` · `/races` · `/races/compare` · `/shoes` · `/bikes` · `/settings`.
- API routes (GET handlers): `/api/strava/connect`, `/api/strava/callback` (OAuth), `/api/uploads/[name]` (photo serving).
- CLI scripts: `scripts/seed.ts` (fake fixtures), `scripts/backfill-load.ts` (recompute all loads). Both refuse a remote DB unless `ALLOW_REMOTE_DB=1` (protects the shared/prod DB).

## Core modules (`src/lib`) — one job each

| Module | Job |
|---|---|
| `db.ts` | The single data-access layer: libSQL client, ordered `MIGRATIONS` registry tracked by `schema_version`, all parameterized queries/mutations. No ORM. The only module importing `@libsql/client`. |
| `actions.ts` | Every server action (mutations). Uniform `ActionResult = {ok:true} \| {ok:false;error}`. The only module with `"use server"`. |
| `identity.ts` | Identity seam: `currentAthlete()` / `requireAthlete()` — resolves/authorizes the current athlete (today the sole owner id 1). The one place multi-tenant/auth later plugs in. |
| `telemetry.ts` | Telemetry seam: `logger` (structured console, captured by Vercel Observability) + `track()` (no-op analytics stub). The one place observability/analytics vendors plug in. |
| `strava.ts` | Strava OAuth + API client: token refresh, sync, gear/detail/streams fetch with lazy caching. Best-effort readers log through `telemetry`. |
| `streams.ts` | Pure normalizer: downsample Strava streams to a ≤400-pt charting shape. |
| `storage.ts` | Photo storage abstraction (Vercel Blob in prod, local disk in dev). |
| `fitness.ts` | Pure engine: per-activity TSS (power→pace→HR→RPE), PMC (CTL/ATL/TSB EWMA), form state, Friel zones. No IO. |
| `races.ts` · `cycling.ts` · `insights.ts` · `blocks.ts` | Race-distance buckets · ride-metric extraction · rolling-window aggregation · race-block builder/analysis. Pure. |
| `coach.ts` | Server-side AI layer (Claude via `@anthropic-ai/sdk`); per-activity chat + weekly digest. Graceful degradation with no API key. |
| `baseline.ts` | The sole owner's baseline gear + threshold fixtures (seeded by the migration). Kept out of `db.ts` (G5.7); the one place to change/remove at productization. |
| `types.ts` · `sports.ts` · `feelings.ts` | Domain types (DB-row-mirroring) + closed taxonomies. Display labels deferred to i18n. |
| `format.ts` · `validate.ts` · `utils.ts` · `lang.ts` · `constants.ts` | Formatters/date math · split validation · `cn()` · lang-cookie resolve · shared constants (e.g. the `NONE` select sentinel). |
| `i18n.ts` | EN source-of-truth dict, `type Dict = typeof en`, `const pt: Dict` (typecheck-enforced parity), `{token}` interpolation. |

## Components

`components/ui/*` — shadcn radix-nova primitives. Feature components: `review-flow` (keyboard-driven review), hand-built SVG `activity-chart` / `pmc-chart`, gear cards/dialogs/matchers, settings/threshold forms, header, coach chat, weekly digest, race compare.

## Main flows

1. **Sync**: `/api/strava/connect` → OAuth → `syncActivities` writes activities as `pending_review` (history before the baseline date is stored pre-confirmed).
2. **Review ritual**: `ReviewFlow` → shoe/bike splits + RPE/feeling/notes → `confirmActivity` → counts toward gear mileage.
3. **Fitness**: `computeLoad` per activity → persisted in `activity_load` → `/fitness` runs `computePmc` → dashboard tiles + PMC chart.
4. **Gear**: shoe/bike CRUD + Strava `gear_id` linkage → mileage rollups on cards.

## Conventions worth knowing

- **RSC/lib boundary**: pages/components are presentational + data-loading; all reads go through `@/lib/db` (or `@/lib/strava`) server-side, all writes through `actions.ts`. Pure domain modules import no IO.
- **Form paradigm (G14.1)**: default to React 19 `<form action={…}>` + `FormData` (the gear dialogs). Controlled `useState` + `preventDefault` is used where inputs need live formatting/validation as the user types (`ThresholdsForm` and `ManualActivityForm` in `settings-forms.tsx`, e.g. live pace formatting via `fmtPaceShort`). This split is intentional; pick the `<form action>` paradigm for new forms unless live per-keystroke derivation is required.
- **Enforcement gate**: `npm run verify` = typecheck + lint + format:check + vitest unit + Playwright e2e (seeded local sqlite, Strava mocked) + knip + madge. CI runs it on every PR.
