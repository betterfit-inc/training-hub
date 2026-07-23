// AI coach layer (server-only). Wraps the Claude API: builds compact plain-text
// context blocks from an activity's metrics and the athlete's fitness state, then
// runs a per-activity chat or a weekly digest. Degrades gracefully — the client
// is created lazily and every caller guards with isCoachConfigured().
import Anthropic from "@anthropic-ai/sdk";
import type { DigestActivity } from "./db";
import type { AthleteThresholds } from "./fitness";
import type { ActivityStreams } from "./streams";
import type { ActivityWithSplits } from "./types";
import { fmtDateLong, fmtDuration, fmtHr, fmtKm, fmtPace } from "./format";

export const COACH_MODEL = "claude-opus-4-8";

export function isCoachConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Lazily created so importing this module never requires the key to be present.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// Context inputs
// ---------------------------------------------------------------------------

export interface CoachLoad {
  tss: number;
  method: string | null;
  intensityFactor: number | null;
}

export interface CoachPmc {
  ctl: number;
  atl: number;
  tsb: number;
}

export interface CoachStreamSummary {
  avgHr: number | null;
  maxHr: number | null;
  fastestPaceSPerKm: number | null;
  slowestPaceSPerKm: number | null;
  avgPower: number | null;
  maxPower: number | null;
  avgCadence: number | null;
}

export interface CoachJournal {
  rpe: number | null;
  feeling: string | null;
  workoutNotes: string | null;
  healthNotes: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  power: "power",
  pace: "pace",
  hr: "heart rate",
  rpe: "RPE",
};

function avg(arr: (number | null)[] | null): number | null {
  if (!arr) return null;
  let sum = 0;
  let count = 0;
  for (const v of arr) {
    if (v == null) continue;
    sum += v;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

function extremum(arr: (number | null)[] | null, kind: "min" | "max"): number | null {
  if (!arr) return null;
  let best: number | null = null;
  for (const v of arr) {
    if (v == null) continue;
    if (best == null || (kind === "min" ? v < best : v > best)) best = v;
  }
  return best;
}

/** Cheap avg/max/range summary of the per-second streams for the context block. */
export function summarizeStreams(s: ActivityStreams): CoachStreamSummary {
  return {
    avgHr: avg(s.heartrate),
    maxHr: extremum(s.heartrate, "max"),
    fastestPaceSPerKm: extremum(s.paceSPerKm, "min"),
    slowestPaceSPerKm: extremum(s.paceSPerKm, "max"),
    avgPower: avg(s.watts),
    maxPower: extremum(s.watts, "max"),
    avgCadence: avg(s.cadence),
  };
}

// ---------------------------------------------------------------------------
// Context builders (compact plain text, metric units, pace as m:ss/km)
// ---------------------------------------------------------------------------

export function buildActivityContext(input: {
  activity: ActivityWithSplits;
  load: CoachLoad | null;
  thresholds: AthleteThresholds;
  pmc: CoachPmc | null;
  streams: CoachStreamSummary | null;
  journal: CoachJournal;
}): string {
  const { activity, load, thresholds, pmc, streams, journal } = input;
  const lines: string[] = [];

  lines.push("WORKOUT");
  lines.push(`- Name: ${activity.name ?? "Untitled"}`);
  lines.push(`- Sport: ${activity.sport_type ?? "unknown"}`);
  lines.push(`- Date: ${fmtDateLong(activity.started_at)}`);
  if (activity.distance_km != null) lines.push(`- Distance: ${fmtKm(activity.distance_km, 2)}`);
  if (activity.moving_time_s) lines.push(`- Moving time: ${fmtDuration(activity.moving_time_s)}`);
  if (activity.avg_pace_s_per_km) lines.push(`- Avg pace: ${fmtPace(activity.avg_pace_s_per_km)}`);
  if (activity.avg_hr) lines.push(`- Avg HR: ${fmtHr(activity.avg_hr)}`);
  if (activity.elevation_gain_m != null)
    lines.push(`- Elevation gain: ${Math.round(activity.elevation_gain_m)} m`);
  if (activity.is_race) {
    const goal = activity.goal_pace_s_per_km
      ? `, goal pace ${fmtPace(activity.goal_pace_s_per_km)}`
      : "";
    lines.push(`- Marked as a race${goal}`);
  }

  if (load) {
    const method = load.method ? ` (from ${METHOD_LABEL[load.method] ?? load.method})` : "";
    const intensity = load.intensityFactor != null ? `, IF ${load.intensityFactor.toFixed(2)}` : "";
    lines.push(`- Training load: ${load.tss.toFixed(0)} TSS${method}${intensity}`);
  }

  if (streams) {
    const parts: string[] = [];
    if (streams.avgHr != null)
      parts.push(
        `HR avg ${Math.round(streams.avgHr)}${streams.maxHr != null ? ` / max ${Math.round(streams.maxHr)}` : ""} bpm`
      );
    if (streams.fastestPaceSPerKm != null && streams.slowestPaceSPerKm != null)
      parts.push(
        `pace ${fmtPace(streams.fastestPaceSPerKm)} (fastest) to ${fmtPace(streams.slowestPaceSPerKm)} (slowest)`
      );
    if (streams.avgPower != null)
      parts.push(
        `power avg ${Math.round(streams.avgPower)}${streams.maxPower != null ? ` / max ${Math.round(streams.maxPower)}` : ""} W`
      );
    if (streams.avgCadence != null) parts.push(`cadence avg ${Math.round(streams.avgCadence)}`);
    if (parts.length > 0) {
      lines.push("");
      lines.push("STREAM RANGES");
      for (const part of parts) lines.push(`- ${part}`);
    }
  }

  lines.push("");
  lines.push("ATHLETE THRESHOLDS");
  lines.push(`- Max HR: ${thresholds.maxHr} bpm`);
  lines.push(
    `- Resting HR: ${thresholds.restingHr} bpm${thresholds.restingHrEstimated ? " (estimated)" : ""}`
  );
  lines.push(`- LTHR: ${thresholds.lthr} bpm`);
  lines.push(`- Threshold pace: ${fmtPace(thresholds.thresholdPaceSPerKm)}`);
  lines.push(`- FTP: ${thresholds.ftpW} W${thresholds.ftpProvisional ? " (provisional)" : ""}`);

  if (pmc) {
    lines.push("");
    lines.push("FITNESS TODAY (Performance Management Chart)");
    lines.push(`- CTL (fitness): ${pmc.ctl.toFixed(0)}`);
    lines.push(`- ATL (fatigue): ${pmc.atl.toFixed(0)}`);
    lines.push(`- TSB (form): ${pmc.tsb.toFixed(0)}`);
  }

  const journalParts: string[] = [];
  if (journal.rpe != null) journalParts.push(`RPE ${journal.rpe}/10`);
  if (journal.feeling) journalParts.push(`feeling: ${journal.feeling}`);
  if (journal.workoutNotes) journalParts.push(`workout notes: ${journal.workoutNotes}`);
  if (journal.healthNotes) journalParts.push(`health notes: ${journal.healthNotes}`);
  if (journalParts.length > 0) {
    lines.push("");
    lines.push("ATHLETE JOURNAL");
    for (const part of journalParts) lines.push(`- ${part}`);
  }

  return lines.join("\n");
}

export function buildDigestContext(input: {
  activities: DigestActivity[];
  thresholds: AthleteThresholds;
  now: CoachPmc | null;
  weekAgo: CoachPmc | null;
}): string {
  const { activities, thresholds, now, weekAgo } = input;
  const lines: string[] = [];

  lines.push("LAST 7 DAYS OF TRAINING");
  if (activities.length === 0) {
    lines.push("- No confirmed activities in the last 7 days.");
  } else {
    for (const a of activities) {
      const bits: string[] = [];
      if (a.distance_km != null) bits.push(fmtKm(a.distance_km, 1));
      if (a.moving_time_s) bits.push(fmtDuration(a.moving_time_s));
      if (a.avg_pace_s_per_km) bits.push(fmtPace(a.avg_pace_s_per_km));
      if (a.avg_hr) bits.push(fmtHr(a.avg_hr));
      const meta = bits.length > 0 ? ` — ${bits.join(", ")}` : "";
      lines.push(
        `- ${fmtDateLong(a.started_at)} · ${a.sport_type ?? "activity"}: ${a.name ?? "Untitled"}${meta}`
      );
    }
  }

  if (now && weekAgo) {
    lines.push("");
    lines.push("FITNESS MOVEMENT (today vs 7 days ago)");
    lines.push(`- CTL (fitness): ${weekAgo.ctl.toFixed(0)} → ${now.ctl.toFixed(0)}`);
    lines.push(`- ATL (fatigue): ${weekAgo.atl.toFixed(0)} → ${now.atl.toFixed(0)}`);
    lines.push(`- TSB (form): ${weekAgo.tsb.toFixed(0)} → ${now.tsb.toFixed(0)}`);
  } else if (now) {
    lines.push("");
    lines.push("FITNESS TODAY");
    lines.push(`- CTL ${now.ctl.toFixed(0)}, ATL ${now.atl.toFixed(0)}, TSB ${now.tsb.toFixed(0)}`);
  }

  lines.push("");
  lines.push("ATHLETE THRESHOLDS");
  lines.push(`- Max HR ${thresholds.maxHr} bpm, LTHR ${thresholds.lthr} bpm`);
  lines.push(
    `- Threshold pace ${fmtPace(thresholds.thresholdPaceSPerKm)}, FTP ${thresholds.ftpW} W`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Claude calls
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an experienced endurance coach analyzing ONE specific workout for the athlete you are talking to.

The athlete's message is preceded by a context block with this workout's metrics, the athlete's thresholds, their current fitness (CTL/ATL/TSB), and any journal notes. Ground every answer in those actual numbers — quote the real values rather than speaking in generalities.

Be concise, specific, and actionable. Use metric units. Write pace as m:ss/km. No filler, no motivational fluff, no restating the whole workout back. If a piece of data is missing, say so briefly instead of inventing it.

Write in plain prose and, where helpful, simple hyphen ("- ") bullet lines. Do NOT use Markdown syntax: no "#" headings, no "*"/"**" bold or italics, no backticks, no tables. The reply is shown as plain text, so any Markdown markers would appear literally.`;

const DIGEST_SYSTEM_PROMPT = `You are an experienced endurance coach writing a short weekly training digest for the athlete you are talking to.

You are given the athlete's confirmed activities from the last 7 days, how their fitness moved (CTL/ATL/TSB), and their thresholds. Summarize:
- what the week did to their fitness (CTL/ATL/TSB movement, in plain terms),
- the volume and one or two standout sessions,
- one or two concrete, specific suggestions for the coming week.

Keep it concise. Use metric units and write pace as m:ss/km. Reference the real numbers. If the week was empty or thin, say so plainly.

Write in plain prose with simple hyphen ("- ") bullet lines and plain-text section labels (e.g. a short line ending in a colon). Do NOT use Markdown syntax: no "#" headings, no "*"/"**" bold or italics, no backticks, no tables. The digest is shown as plain text, so any Markdown markers would appear literally.`;

/** Concatenates the text blocks of a Claude response into a plain string. */
function extractText(res: Anthropic.Message): string {
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

export async function runCoachChat(
  context: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Context for the workout we are discussing:\n\n${context}` },
    ...history,
    { role: "user", content: userMessage },
  ];
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages,
  });
  return extractText(res);
}

export async function runWeeklyDigest(context: string): Promise<string> {
  const res = await getClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });
  return extractText(res);
}
