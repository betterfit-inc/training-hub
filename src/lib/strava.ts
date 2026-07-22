import {
  activityExistsByStravaId,
  countPending,
  findBikeIdByGear,
  findShoeIdByGear,
  getMeta,
  getStravaAuth,
  insertSyncedActivity,
  latestSyncedStartEpoch,
  saveActivityDetail,
  saveStravaAuth,
  setMeta,
} from "./db";
import { isRideSport } from "./cycling";
import type { Activity } from "./types";
import { round2 } from "./format";
import { isRunSport } from "./validate";
import type { SplitInput, StravaGear } from "./types";

const TOKEN_URL = "https://www.strava.com/oauth/token";
const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const API_BASE = "https://www.strava.com/api/v3";

export function stravaConfigured(): boolean {
  return !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export async function isStravaConnected(): Promise<boolean> {
  return (await getStravaAuth()) !== null;
}

/** True when connected and the last sync is more than an hour old (or never ran). */
export async function shouldAutoSync(): Promise<boolean> {
  if (!stravaConfigured() || !(await isStravaConnected())) return false;
  const lastSync = await getMeta("last_sync_at");
  return !lastSync || Date.now() - Date.parse(lastSync) > 60 * 60 * 1000;
}

export function buildAuthorizeUrl(origin: string, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", `${origin}/api/strava/callback`);
  url.searchParams.set("approval_prompt", "auto");
  // profile:read_all is required for the athlete endpoint to return gear
  // (shoes + bikes); activity:read_all alone omits them.
  url.searchParams.set("scope", "activity:read_all,profile:read_all");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    client_secret: process.env.STRAVA_CLIENT_SECRET ?? "",
    ...params,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Strava token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string): Promise<void> {
  const token = await requestToken({ grant_type: "authorization_code", code });
  await saveStravaAuth({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
  });
  if (token.athlete) {
    const name = [token.athlete.firstname, token.athlete.lastname]
      .filter(Boolean)
      .join(" ");
    if (name) await setMeta("athlete_name", name);
  }
}

/** Returns a valid access token, refreshing it first when close to expiry. */
async function getAccessToken(): Promise<string> {
  const auth = await getStravaAuth();
  if (!auth) throw new Error("Strava is not connected.");
  const now = Math.floor(Date.now() / 1000);
  if (auth.expires_at > now + 120) return auth.access_token;
  const token = await requestToken({
    grant_type: "refresh_token",
    refresh_token: auth.refresh_token,
  });
  await saveStravaAuth({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
  });
  return token.access_token;
}

async function apiGet<T>(pathname: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Strava rejected the token. Reconnect from Settings.");
    if (res.status === 429) throw new Error("Strava rate limit reached. Try again in a few minutes.");
    throw new Error(`Strava API error (${res.status}).`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Gear (shoes + bikes)
// ---------------------------------------------------------------------------

type RawGear = { id: string; name: string; distance?: number; retired?: boolean };
interface StravaAthlete {
  shoes?: RawGear[];
  bikes?: RawGear[];
}

function mapGear(list: RawGear[] | undefined): StravaGear[] {
  return (list ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    distance: g.distance,
    retired: g.retired,
  }));
}

export async function fetchAthleteGear(): Promise<{ shoes: StravaGear[]; bikes: StravaGear[] }> {
  const athlete = await apiGet<StravaAthlete>("/athlete");
  return { shoes: mapGear(athlete.shoes), bikes: mapGear(athlete.bikes) };
}

/** Shoe gear list for dropdowns; null when not connected or the request fails. */
export async function tryFetchGear(): Promise<StravaGear[] | null> {
  if (!stravaConfigured() || !(await isStravaConnected())) return null;
  try {
    return (await fetchAthleteGear()).shoes;
  } catch {
    return null;
  }
}

/** Bike gear list for dropdowns; null when not connected or the request fails. */
export async function tryFetchBikes(): Promise<StravaGear[] | null> {
  if (!stravaConfigured() || !(await isStravaConnected())) return null;
  try {
    return (await fetchAthleteGear()).bikes;
  } catch {
    return null;
  }
}

/** Both gear lists in one athlete call; null when not connected or it fails. */
export async function tryFetchAllGear(): Promise<{
  shoes: StravaGear[];
  bikes: StravaGear[];
} | null> {
  if (!stravaConfigured() || !(await isStravaConnected())) return null;
  try {
    return await fetchAthleteGear();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity detail (laps + km splits), fetched lazily and cached forever
// ---------------------------------------------------------------------------

export interface StravaLap {
  lap_index?: number;
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
}

export interface StravaSplit {
  split?: number;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_heartrate?: number;
  elevation_difference?: number;
}

export interface StravaActivityDetail {
  id?: number;
  description?: string | null;
  calories?: number;
  device_name?: string;
  max_heartrate?: number;
  laps?: StravaLap[];
  splits_metric?: StravaSplit[];
}

export function parseActivityDetail(json: string | null): StravaActivityDetail | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as StravaActivityDetail;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Returns the cached Strava detail for an activity, fetching and caching it on
 * first view. One API call per activity ever, so the read rate limit is never
 * an issue. Returns null for manual activities, when disconnected, or when the
 * fetch fails (the page then simply omits the detail sections).
 */
export async function ensureActivityDetail(
  activity: Pick<Activity, "id" | "strava_id" | "detail_json">
): Promise<StravaActivityDetail | null> {
  if (activity.detail_json) return parseActivityDetail(activity.detail_json);
  if (!activity.strava_id) return null;
  if (!stravaConfigured() || !(await isStravaConnected())) return null;
  try {
    const detail = await apiGet<StravaActivityDetail>(`/activities/${activity.strava_id}`);
    await saveActivityDetail(activity.id, JSON.stringify(detail));
    return detail;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity sync
// ---------------------------------------------------------------------------

interface StravaActivity {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
  total_elevation_gain?: number;
  gear_id?: string | null;
}

export interface SyncResult {
  imported: number;
  pendingNew: number;
  pendingTotal: number;
}

/**
 * Pulls activities from Strava, newest first, only asking for activities that
 * started after the most recent synced one. Activities older than the baseline
 * date are stored as confirmed with no splits: they show up in the log but the
 * shoe baselines already cover their mileage. Everything newer lands in the
 * review queue with one pre-filled split.
 */
export async function syncActivities(): Promise<SyncResult> {
  const afterEpoch = await latestSyncedStartEpoch();
  const baselineIso = await getMeta("baseline_date");
  const baselineMs = baselineIso ? Date.parse(baselineIso) : 0;

  let imported = 0;
  let pendingNew = 0;
  const perPage = 100;

  for (let page = 1; page <= 50; page++) {
    const params: Record<string, string> = {
      per_page: String(perPage),
      page: String(page),
    };
    if (afterEpoch) params.after = String(afterEpoch);

    const batch = await apiGet<StravaActivity[]>("/athlete/activities", params);
    if (batch.length === 0) break;

    for (const activity of batch) {
      if (!activity.id || !activity.start_date) continue;
      if (await activityExistsByStravaId(activity.id)) continue;

      const distanceKm = activity.distance ? round2(activity.distance / 1000) : 0;
      const movingS = activity.moving_time ?? null;
      const pace =
        activity.distance && activity.distance > 0 && movingS
          ? Math.round(movingS / (activity.distance / 1000))
          : null;
      const sport = activity.sport_type ?? activity.type ?? null;
      const preBaseline = Date.parse(activity.start_date) < baselineMs;

      let status: "confirmed" | "pending_review";
      let splits: SplitInput[] = [];
      let bikeId: number | null = null;
      if (preBaseline) {
        // History only: visible in the log, zero gear mileage.
        status = "confirmed";
      } else {
        status = "pending_review";
        const matchedGearId = activity.gear_id ?? null;
        if (isRideSport(sport)) {
          bikeId = matchedGearId ? await findBikeIdByGear(matchedGearId) : null;
        } else {
          const matchedShoeId = matchedGearId ? await findShoeIdByGear(matchedGearId) : null;
          if ((isRunSport(sport) || matchedShoeId) && distanceKm > 0) {
            splits = [{ shoe_id: matchedShoeId, km: distanceKm }];
          }
        }
        pendingNew++;
      }

      await insertSyncedActivity(
        {
          strava_id: activity.id,
          name: activity.name ?? null,
          sport_type: sport,
          started_at: activity.start_date,
          distance_km: distanceKm,
          moving_time_s: movingS,
          avg_pace_s_per_km: pace,
          avg_hr: activity.average_heartrate ?? null,
          elevation_gain_m: activity.total_elevation_gain ?? null,
          status,
          raw_json: JSON.stringify(activity),
          bike_id: bikeId,
        },
        splits
      );
      imported++;
    }

    if (batch.length < perPage) break;
  }

  await setMeta("last_sync_at", new Date().toISOString());
  return { imported, pendingNew, pendingTotal: await countPending() };
}
