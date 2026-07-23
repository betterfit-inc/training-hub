import { batchWrite, exec, one } from "./helpers";
import { currentAthlete, requireAthlete } from "../identity";

export interface StravaAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getStravaAuth(): Promise<StravaAuthRow | null> {
  const row = await one<StravaAuthRow>(
    "SELECT access_token, refresh_token, expires_at FROM strava_auth WHERE id = ?",
    [currentAthlete().id]
  );
  if (!row || !row.access_token || !row.refresh_token) return null;
  return row;
}

export async function saveStravaAuth(auth: StravaAuthRow): Promise<void> {
  await exec(
    `INSERT INTO strava_auth (id, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`,
    [requireAthlete().id, auth.access_token, auth.refresh_token, auth.expires_at]
  );
}

export async function clearStravaAuth(): Promise<void> {
  await batchWrite([
    { sql: "DELETE FROM strava_auth WHERE id = ?", args: [requireAthlete().id] },
    "DELETE FROM app_meta WHERE key = 'athlete_name'",
  ]);
}
