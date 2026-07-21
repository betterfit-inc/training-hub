"use server";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  UPLOADS_DIR,
  clearStravaAuth,
  createManualActivity,
  createShoe,
  getActivity,
  getShoe,
  replaceActivitySplits,
  setShoeGear,
  setShoeRetired,
  updateActivityJournal,
  updateShoe,
  confirmActivity,
  type JournalFields,
  type ShoeFields,
} from "./db";
import { stravaConfigured, isStravaConnected, syncActivities, type SyncResult } from "./strava";
import { validateSplits } from "./validate";
import type { Feeling, SplitInput } from "./types";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

function refreshAll() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncActionResult =
  | ({ ok: true } & SyncResult)
  | { ok: false; error: string };

export async function syncNowAction(): Promise<SyncActionResult> {
  if (!stravaConfigured()) {
    return { ok: false, error: "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET first (see Settings)." };
  }
  if (!isStravaConnected()) {
    return { ok: false, error: "Connect Strava from Settings first." };
  }
  try {
    const result = await syncActivities();
    refreshAll();
    return { ok: true, ...result };
  } catch (error) {
    return fail(error, "Sync failed.");
  }
}

// ---------------------------------------------------------------------------
// Review + journal
// ---------------------------------------------------------------------------

const FEELINGS: Feeling[] = ["great", "good", "ok", "rough", "terrible"];

function normalizeJournal(input: {
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): JournalFields | { error: string } {
  const rpe = input.rpe == null ? null : Math.round(input.rpe);
  if (rpe != null && (rpe < 1 || rpe > 10)) return { error: "RPE must be between 1 and 10." };
  if (input.feeling != null && !FEELINGS.includes(input.feeling)) {
    return { error: "Unknown feeling value." };
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
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  try {
    const activity = getActivity(input.activityId);
    if (!activity) return { ok: false, error: "Activity not found." };
    if (activity.status === "confirmed") return { ok: false, error: "Activity is already confirmed." };

    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitError };

    const journal = normalizeJournal(input);
    if ("error" in journal) return { ok: false, error: journal.error };

    confirmActivity(input.activityId, journal, splits);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not confirm the activity.");
  }
}

export async function updateJournalAction(input: {
  activityId: number;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}): Promise<ActionResult> {
  try {
    const activity = getActivity(input.activityId);
    if (!activity) return { ok: false, error: "Activity not found." };
    const journal = normalizeJournal(input);
    if ("error" in journal) return { ok: false, error: journal.error };
    updateActivityJournal(input.activityId, journal);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save the notes.");
  }
}

export async function updateSplitsAction(input: {
  activityId: number;
  splits: SplitInput[];
}): Promise<ActionResult> {
  try {
    const activity = getActivity(input.activityId);
    if (!activity) return { ok: false, error: "Activity not found." };
    const splits = normalizeSplits(input.splits);
    const splitError = validateSplits(activity, splits);
    if (splitError) return { ok: false, error: splitError };
    replaceActivitySplits(input.activityId, splits);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save the splits.");
  }
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function storePhoto(file: File): Promise<string> {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error("Photo must be a JPEG, PNG, WebP, AVIF or GIF image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large (8 MB max).");
  const name = `shoe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return name;
}

export async function saveShoeAction(formData: FormData): Promise<ActionResult> {
  try {
    const idRaw = formData.get("id");
    const id = typeof idRaw === "string" && idRaw ? Number(idRaw) : null;

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "The shoe needs a name." };

    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0);
    const retirementKm = Number(formData.get("retirement_km") ?? 700);
    if (!Number.isFinite(initialKm) || initialKm < 0) {
      return { ok: false, error: "Baseline km must be zero or more." };
    }
    if (!Number.isFinite(retirementKm) || retirementKm <= 0) {
      return { ok: false, error: "Retirement km must be greater than zero." };
    }

    const gearRaw = String(formData.get("strava_gear_id") ?? "none");
    const gearId = gearRaw && gearRaw !== "none" ? gearRaw : null;

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
      if (!getShoe(id)) return { ok: false, error: "Shoe not found." };
      updateShoe(id, fields, photoPath);
    } else {
      createShoe(fields, photoPath);
    }
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not save the shoe.");
  }
}

export async function setShoeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  try {
    if (!getShoe(id)) return { ok: false, error: "Shoe not found." };
    setShoeRetired(id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not update the shoe.");
  }
}

export async function setShoeGearAction(
  shoeId: number,
  gearId: string | null
): Promise<ActionResult> {
  try {
    if (!getShoe(shoeId)) return { ok: false, error: "Shoe not found." };
    setShoeGear(shoeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not link the gear.");
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function disconnectStravaAction(): Promise<ActionResult> {
  try {
    clearStravaAuth();
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not disconnect.");
  }
}

export async function createManualActivityAction(input: {
  date: string;
  km: number;
  shoeId: number;
}): Promise<ActionResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: "Pick a valid date." };
    }
    const km = Math.round((Number(input.km) || 0) * 100) / 100;
    if (km === 0) return { ok: false, error: "Distance cannot be zero." };
    if (!getShoe(input.shoeId)) return { ok: false, error: "Pick a shoe." };
    createManualActivity({ date: input.date, km, shoe_id: input.shoeId });
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not create the manual activity.");
  }
}
