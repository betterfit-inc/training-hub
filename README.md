# Training Hub

A private, single user training log with Strava sync and per shoe mileage tracking. Runs on localhost, stores everything in a local SQLite file, and never writes anything back to Strava.

The core idea: synced activities land in a review queue. Nothing counts toward shoe mileage until you confirm it. Confirming a run, picking its shoes, and journaling how it went is one 30 second ritual.

## Stack

- Next.js (App Router) with TypeScript, server components and server actions
- shadcn/ui and Tailwind CSS
- SQLite through libSQL, plain SQL, no ORM. Dev and prod use separate databases: local development uses the file `data/app.db`, and only the deployment points `TURSO_DATABASE_URL` at the Turso database. Leave `TURSO_*` empty locally so your machine never touches prod. Created and migrated automatically on first run either way
- Shoe photos go to `data/uploads/` locally (served by a small file route) and to Vercel Blob when deployed

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Strava API application at [strava.com/settings/api](https://www.strava.com/settings/api):
   - Application name and website can be anything (for example, `http://localhost:3000`)
   - Set Authorization Callback Domain to `localhost`

3. Copy the env file and fill in the two values from the Strava app page:

   ```bash
   cp .env.example .env.local
   ```

   `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are the only environment variables. Tokens and all other state live in SQLite.

4. Run the app:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000), go to Settings, and press Connect Strava. After the OAuth flow finishes, press Sync and link each shoe to its Strava gear in the Gear matching section.

## Seed data

To evaluate the UI without a Strava connection:

```bash
npm run seed        # inserts ~10 fake activities in mixed statuses
npm run seed:clear  # removes only the fake activities
```

Seeding uses the real shoes from the baseline migration and never touches them or their mileage baselines.

The write scripts (`npm run seed`, `npm run seed:clear`, `npm run backfill:load`) are guarded: they only run against a local `file:` database. If the resolved URL is remote (a Turso/`libsql://`, `http://`, or `https://` URL, i.e. `TURSO_DATABASE_URL` is set), they refuse so a stray env var can't rewrite the shared/prod DB from your machine. Override deliberately with `ALLOW_REMOTE_DB=1` (or `--force`).

## How the review flow works

- The Sync button in the header pulls new activities from Strava. The app also syncs automatically on load when the last sync is more than an hour old. Pending activities show as a badge on the Review tab and a banner on the log.
- The Review page shows one activity at a time. Each synced run arrives with one pre-filled split covering the full distance, assigned to the shoe whose linked Strava gear matches. If no shoe matches, the queue flags it.
- You can confirm as is, change the shoe, or split the activity into segments with different shoes and distances per segment. Split distances must add up to the run distance, and the editor shows the remaining kilometers live as you type.
- RPE, feeling, workout notes and health notes are optional and saved in the same confirm step.
- The whole flow works from the keyboard: Enter confirms, arrow keys navigate, E focuses the split editor, and the number keys set RPE.

## How shoe mileage works

Shoe mileage is `initial_km` plus the sum of confirmed splits. The baseline migration inserts the shoes with their current corrected mileage as `initial_km`, and records the migration date as `baseline_date`. Synced activities that started before that date are stored as confirmed history with no splits: they appear in the log but add no shoe mileage, because the baselines already include them. Only newer activities go through the review queue.

To correct mileage later, use the manual adjustment tool in Settings. It creates a manual confirmed activity for a date, distance and shoe; negative distances subtract.

## Deploying to Vercel

Vercel's filesystem is ephemeral, so the deployed app stores data in Turso (a hosted libSQL/SQLite service) and photos in Vercel Blob. Locally nothing changes: with no `TURSO_DATABASE_URL` set, the app keeps using `data/app.db`.

1. Create the database on Turso and import your local data in one step:

   ```bash
   brew install tursodatabase/tap/turso
   turso auth signup
   turso db create training-hub --from-file data/app.db
   turso db show training-hub --url        # -> TURSO_DATABASE_URL
   turso db tokens create training-hub     # -> TURSO_AUTH_TOKEN
   ```

2. In the Vercel project, add the environment variables: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. To enforce the owner login also set `AUTH_PASSWORD` and `AUTH_SECRET`; to accept the daily health sync set `HEALTH_INGEST_SECRET` (the same value the sync service uses, see `services/garmin-sync/README.md`) — without it `POST /api/health/ingest` stays closed (503).

3. In the Vercel project's Storage tab, create a Blob store and connect it. That injects `BLOB_READ_WRITE_TOKEN` automatically. Shoe photos uploaded locally are files on your machine, so re-upload them once through each shoe's Edit dialog on the deployed app.

4. In your Strava API application settings, set the Authorization Callback Domain to the deployed domain (for example `training-hub-psi-one.vercel.app`). Strava allows a single callback domain, so switch it back to `localhost` when you want to reconnect locally, or use a second Strava API app for local development.

5. Redeploy. To keep the app private, enable Deployment Protection in the Vercel project settings.

## Notes

- Non-run activities (rides, workouts, and so on) sync and appear in the log, but shoe splits are optional for them.
- Retiring a shoe hides it from the default pickers without touching its history. The threshold for the wear bar is editable per shoe (700 km by default).
- `data/` (database and photos) and `.env.local` are ignored by git.
