"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NONE } from "./constants";
import { dictionaries, splitErrorText, isLang, type Dict } from "./i18n";
import { LANG_COOKIE, getLang } from "./lang";
import { storePhoto, deletePhoto, InvalidImageError } from "./storage";
import {
  addActivityChatMessage,
  clearActivityChat,
  clearStravaAuth,
  createBike,
  createManualActivity,
  createShoe,
  getActivity,
  getActivityLoad,
  getAthleteThresholds,
  getBike,
  getShoe,
  listActivitiesSince,
  listActivityChat,
  listActivityLoadsForPmc,
  recomputeActivityLoad,
  recomputeAllLoads,
  replaceActivitySplits,
  saveAthleteThresholds,
  setActivityBike,
  setActivityLoadManual,
  setActivityRace,
  setBikeGear,
  setBikeRetired,
  setShoeGear,
  setShoeRetired,
  setWeeklyDigest,
  updateActivityJournal,
  updateBike,
  updateShoe,
  confirmActivity,
  type BikeFields,
  type JournalFields,
  type ShoeFields,
} from "./db";
import {
  buildActivityContext,
  buildDigestContext,
  isCoachConfigured,
  runCoachChat,
  runWeeklyDigest,
  summarizeStreams,
  type CoachLoad,
  type CoachPmc,
  type CoachStreamSummary,
} from "./coach";
import { computeLoad, computePmc, dailyLoadSeries, type PmcPoint } from "./fitness";
import {
  ensureActivityStreams,
  stravaConfigured,
  isStravaConnected,
  syncActivities,
  type SyncResult,
} from "./strava";
import { parseId, validateSplits } from "./validate";
import { fail, type ActionResult } from "./action-result";
import { logger } from "./telemetry";
import { authConfigured, createSession, destroySession, requireAuth, verifyPassword } from "./auth";
import type { Feeling, SplitInput } from "./types";

async function dict(): Promise<Dict> {
  return dictionaries[await getLang()];
}

function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export async function setLangAction(lang: string): Promise<void> {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  refreshAll();
}

// ---------------------------------------------------------------------------
// Auth (T1.6) — single-owner password login. The mutating actions below each
// call requireAuth(); these two manage the session itself and so are NOT gated.
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  const password = String(formData.get("password") ?? "");
  // Refuse to authenticate when auth is unconfigured (empty password/secret) —
  // there is no session to create against an empty secret.
  if (!authConfigured() || !verifyPassword(password)) {
    return { ok: false, error: t.login.invalid };
  }
  await createSession();
  // redirect() throws NEXT_REDIRECT, so it must sit outside any try/catch.
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncActionResult = ({ ok: true } & SyncResult) | { ok: false; error: string };

export async function syncNowAction(): Promise<SyncActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!stravaConfigured()) return { ok: false, error: t.errors.envMissing };
  if (!(await isStravaConnected())) return { ok: false, error: t.errors.notConnected };
  try {
    const result = await syncActivities();
    refreshAll();
    return { ok: true, ...result };
  } catch (error) {
    return fail(error, t.errors.syncFailed);
  }
}

// ---------------------------------------------------------------------------
// Review + journal
// ---------------------------------------------------------------------------

const FEELINGS: Feeling[] = ["great", "good", "ok", "rough", "terrible"];

function normalizeJournal(
  input: {
    rpe: number | null;
    feeling: Feeling | null;
    workoutNotes: string;
    healthNotes: string;
  },
  t: Dict
): JournalFields | { error: string } {
  const rpe = input.rpe == null ? null : Math.round(input.rpe);
  if (rpe != null && (rpe < 1 || rpe > 10)) return { error: t.errors.invalidRpe };
  if (input.feeling != null && !FEELINGS.includes(input.feeling)) {
    return { error: t.errors.invalidFeeling };
  }
  return {
    rpe,
    feeling: input.feeling,
    workout_notes: input.workoutNotes.trim() || null,
    health_notes: input.healthNotes.trim() || null,
  };
}

function normalizeSplits(splits: SplitInput[]): SplitInput[] {
  return splits.map((s) => ({
    shoe_id: s.shoe_id,
    km: Math.round((Number(s.km) || 0) * 100) / 100,
  }));
}

export async function confirmActivityAction(input: {
  activityId: number;
  splits: SplitInput[];
  bikeId: number | null;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    if (activity.status === "confirmed") return { ok: false, error: t.errors.alreadyConfirmed };

    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };

    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };

    const bikeId = input.bikeId != null && (await getBike(input.bikeId)) ? input.bikeId : null;

    await confirmActivity(input.activityId, journal, splits, bikeId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function updateJournalAction(input: {
  activityId: number;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const journal = normalizeJournal(input, t);
    if ("error" in journal) return { ok: false, error: journal.error };
    await updateActivityJournal(input.activityId, journal);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function updateSplitsAction(input: {
  activityId: number;
  splits: SplitInput[];
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitErrorText(splitError, t) };
    await replaceActivitySplits(input.activityId, splits);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityBikeAction(
  activityId: number,
  bikeId: number | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const resolved = bikeId != null && (await getBike(bikeId)) ? bikeId : null;
    await setActivityBike(activityId, resolved);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityRaceAction(input: {
  activityId: number;
  isRace: boolean;
  goalPace: number | null;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };
    const goal =
      input.goalPace != null && Number.isFinite(input.goalPace) && input.goalPace > 0
        ? Math.round(input.goalPace)
        : null;
    await setActivityRace(input.activityId, input.isRace, goal);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Fitness (thresholds + per-activity load)
// ---------------------------------------------------------------------------

export interface ThresholdsInput {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
}

function inRange(value: number, lo: number, hi: number): boolean {
  return Number.isFinite(value) && value >= lo && value <= hi;
}

export async function saveThresholdsAction(input: ThresholdsInput): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    const maxHr = Math.round(input.maxHr);
    const restingHr = Math.round(input.restingHr);
    const lthr = Math.round(input.lthr);
    const thresholdPace = Math.round(input.thresholdPaceSPerKm);
    const ftpW = Math.round(input.ftpW);
    if (
      !inRange(maxHr, 120, 230) ||
      !inRange(restingHr, 25, 90) ||
      !inRange(lthr, 90, 220) ||
      !inRange(thresholdPace, 120, 600) ||
      !inRange(ftpW, 50, 600) ||
      restingHr >= lthr ||
      lthr > maxHr
    ) {
      return { ok: false, error: t.errors.invalidThresholds };
    }
    await saveAthleteThresholds({
      maxHr,
      restingHr,
      lthr,
      thresholdPaceSPerKm: thresholdPace,
      ftpW,
      restingHrEstimated: input.restingHrEstimated,
      ftpProvisional: input.ftpProvisional,
    });
    // Thresholds drive every TSS value, so the curves must refresh with them.
    // But that recompute scales with confirmed-activity history (1200+ rows) and
    // must not block the save response (G7.3, T3.7): the edit above is already
    // durably persisted, so schedule the recompute to run AFTER the response with
    // `after()` (Next 16, `next/server`) instead of awaiting it in-request. A
    // post-response failure is logged (not swallowed) so it stays observable; the
    // thresholds remain saved regardless of the deferred recompute's outcome.
    after(async () => {
      try {
        await recomputeAllLoads();
      } catch (error) {
        logger.error("actions.saveThresholds.recompute", { error });
      }
    });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setActivityLoadManualAction(
  activityId: number,
  tss: number
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getActivity(activityId))) return { ok: false, error: t.errors.activityNotFound };
    const value = Math.round((Number(tss) || 0) * 10) / 10;
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: t.errors.invalidLoad };
    await setActivityLoadManual(activityId, value);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function resetActivityLoadAction(activityId: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getActivity(activityId))) return { ok: false, error: t.errors.activityNotFound };
    await recomputeActivityLoad(activityId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

export async function saveShoeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    // An absent/blank id means "create"; a present-but-invalid id must NOT
    // silently fall through to create a stray row (G6.4).
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.shoeNeedsName };

    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0);
    const retirementKm = Number(formData.get("retirement_km") ?? 700);
    if (!Number.isFinite(initialKm) || initialKm < 0) {
      return { ok: false, error: t.errors.invalidBaseline };
    }
    if (!Number.isFinite(retirementKm) || retirementKm <= 0) {
      return { ok: false, error: t.errors.invalidRetirement };
    }

    const gearRaw = String(formData.get("strava_gear_id") ?? NONE);
    const gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;

    let photoPath: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoPath = await storePhoto(photo);
    }

    const fields: ShoeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      retirement_km: Math.round(retirementKm),
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getShoe(id);
      if (!existing) return { ok: false, error: t.errors.shoeNotFound };
      await updateShoe(id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(orphan));
      }
    } else {
      await createShoe(fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function setShoeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(id))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeRetired(id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setShoeGearAction(
  shoeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getShoe(shoeId))) return { ok: false, error: t.errors.shoeNotFound };
    await setShoeGear(shoeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Bikes
// ---------------------------------------------------------------------------

export async function saveBikeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    // An absent/blank id means "create"; a present-but-invalid id must NOT
    // silently fall through to create a stray row (G6.4).
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.bikeNeedsName };

    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0);
    if (!Number.isFinite(initialKm) || initialKm < 0) {
      return { ok: false, error: t.errors.invalidBaseline };
    }

    const gearRaw = String(formData.get("strava_gear_id") ?? NONE);
    const gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;

    let photoPath: string | null = null;
    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoPath = await storePhoto(photo);
    }

    const fields: BikeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      strava_gear_id: gearId,
    };

    if (id) {
      const existing = await getBike(id);
      if (!existing) return { ok: false, error: t.errors.bikeNotFound };
      await updateBike(id, fields, photoPath);
      // A replaced photo orphans the previous asset; clean it up after the
      // response so it never blocks or fails the save (best-effort, logs).
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(orphan));
      }
    } else {
      await createBike(fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function setBikeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(id))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeRetired(id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function setBikeGearAction(
  bikeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!(await getBike(bikeId))) return { ok: false, error: t.errors.bikeNotFound };
    await setBikeGear(bikeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function disconnectStravaAction(): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    await clearStravaAuth();
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function createManualActivityAction(input: {
  date: string;
  km: number;
  shoeId: number;
}): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: t.errors.invalidDate };
    }
    const km = Math.round((Number(input.km) || 0) * 100) / 100;
    if (km === 0) return { ok: false, error: t.errors.zeroDistance };
    if (!(await getShoe(input.shoeId))) return { ok: false, error: t.errors.pickShoe };
    await createManualActivity({ date: input.date, km, shoe_id: input.shoeId });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

// ---------------------------------------------------------------------------
// AI coach (Claude API)
// ---------------------------------------------------------------------------

export type CoachMessageResult = { ok: true; reply: string } | { ok: false; error: string };
export type WeeklyDigestResult =
  { ok: true; text: string; generatedAt: string } | { ok: false; error: string };

/**
 * Whole-history Performance Management Chart, gap-filled to today. Mirrors the
 * fitness page: sum TSS per local calendar day, then run the EWMA. Empty when no
 * confirmed activity has a training load yet.
 */
async function buildPmc(): Promise<PmcPoint[]> {
  return computePmc(dailyLoadSeries(await listActivityLoadsForPmc()));
}

function pmcPoint(point: PmcPoint | null | undefined): CoachPmc | null {
  return point ? { ctl: point.ctl, atl: point.atl, tsb: point.tsb } : null;
}

export async function sendCoachMessageAction(input: {
  activityId: number;
  message: string;
}): Promise<CoachMessageResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  const message = input.message.trim();
  if (!message) return { ok: false, error: t.errors.generic };
  try {
    const activity = await getActivity(input.activityId);
    if (!activity) return { ok: false, error: t.errors.activityNotFound };

    const thresholds = await getAthleteThresholds();

    const stored = await getActivityLoad(activity.id);
    let load: CoachLoad | null = null;
    if (stored) {
      load = { tss: stored.tss, method: stored.method, intensityFactor: stored.intensity_factor };
    } else {
      const computed = computeLoad(activity, thresholds);
      if (computed) {
        load = {
          tss: computed.tss,
          method: computed.method,
          intensityFactor: computed.intensityFactor,
        };
      }
    }

    const pmc = await buildPmc();
    const todayPmc = pmcPoint(pmc[pmc.length - 1]);

    // Cheap: streams are cached in the DB after the first activity view; only a
    // cold, never-viewed activity would fetch from Strava here.
    let streams: CoachStreamSummary | null = null;
    try {
      const raw = await ensureActivityStreams(activity);
      if (raw) streams = summarizeStreams(raw);
    } catch {
      streams = null;
    }

    const context = buildActivityContext({
      activity,
      load,
      thresholds,
      pmc: todayPmc,
      streams,
      journal: {
        rpe: activity.rpe,
        feeling: activity.feeling,
        workoutNotes: activity.workout_notes,
        healthNotes: activity.health_notes,
      },
    });

    const history = (await listActivityChat(activity.id)).map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    }));

    await addActivityChatMessage(activity.id, "user", message);
    const reply = await runCoachChat(context, history, message);
    await addActivityChatMessage(activity.id, "assistant", reply);
    refreshAll();
    return { ok: true, reply };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}

export async function clearCoachAction(activityId: number): Promise<ActionResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  try {
    await clearActivityChat(activityId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function generateWeeklyDigestAction(): Promise<WeeklyDigestResult> {
  const t = await dict();
  if (!(await requireAuth())) return { ok: false, error: t.errors.unauthorized };
  if (!isCoachConfigured()) return { ok: false, error: t.errors.coachNotConfigured };
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [activities, thresholds, pmc] = await Promise.all([
      listActivitiesSince(since),
      getAthleteThresholds(),
      buildPmc(),
    ]);
    const context = buildDigestContext({
      activities,
      thresholds,
      now: pmcPoint(pmc[pmc.length - 1]),
      weekAgo: pmcPoint(pmc.length >= 8 ? pmc[pmc.length - 8] : pmc[0]),
    });
    const text = await runWeeklyDigest(context);
    const saved = await setWeeklyDigest(text);
    refreshAll();
    return { ok: true, text: saved.text, generatedAt: saved.generatedAt };
  } catch (error) {
    return fail(error, t.errors.coachFailed);
  }
}
