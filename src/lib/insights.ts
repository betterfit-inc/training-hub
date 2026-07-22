import { sportCategory, type SportCategory } from "./sports";
import type { Activity } from "./types";

export interface CategoryStats {
  category: SportCategory;
  sessions: number;
  activeDays: number;
  km: number;
  movingS: number;
  longestKm: number;
  longestS: number;
  avgPaceSPerKm: number | null;
}

export interface Insights {
  windowDays: number;
  sessions: number;
  activeDays: number;
  km: number;
  movingS: number;
  categories: CategoryStats[];
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Aggregates confirmed activities from the last `windowDays` days into
 * overall and per-category stats. Categories come back in descending
 * session order, empty ones omitted.
 */
export function computeInsights(activities: Activity[], windowDays: number): Insights {
  const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const allDays = new Set<string>();
  const byCategory = new Map<SportCategory, CategoryStats & { days: Set<string> }>();
  let sessions = 0;
  let km = 0;
  let movingS = 0;

  for (const activity of activities) {
    if (!activity.started_at) continue;
    const startedMs = Date.parse(activity.started_at);
    if (!Number.isFinite(startedMs) || startedMs < sinceMs) continue;

    const category = sportCategory(activity.sport_type);
    let stats = byCategory.get(category);
    if (!stats) {
      stats = {
        category,
        sessions: 0,
        activeDays: 0,
        km: 0,
        movingS: 0,
        longestKm: 0,
        longestS: 0,
        avgPaceSPerKm: null,
        days: new Set<string>(),
      };
      byCategory.set(category, stats);
    }

    const distance = activity.distance_km ?? 0;
    const duration = activity.moving_time_s ?? 0;
    const day = dayKey(activity.started_at);

    sessions += 1;
    km += distance;
    movingS += duration;
    allDays.add(day);

    stats.sessions += 1;
    stats.km += distance;
    stats.movingS += duration;
    stats.days.add(day);
    if (distance > stats.longestKm) stats.longestKm = distance;
    if (duration > stats.longestS) stats.longestS = duration;
  }

  const categories: CategoryStats[] = [...byCategory.values()]
    .map(({ days, ...stats }) => ({
      ...stats,
      activeDays: days.size,
      avgPaceSPerKm: stats.km > 0.1 && stats.movingS > 0 ? stats.movingS / stats.km : null,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    windowDays,
    sessions,
    activeDays: allDays.size,
    km,
    movingS,
    categories,
  };
}
