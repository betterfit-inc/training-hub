import type { Feeling } from "./types";

export interface FeelingMeta {
  value: Feeling;
  label: string;
  emoji: string;
  badgeClass: string;
}

export const FEELINGS: FeelingMeta[] = [
  {
    value: "great",
    label: "Great",
    emoji: "😁",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
  {
    value: "good",
    label: "Good",
    emoji: "🙂",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  },
  {
    value: "ok",
    label: "OK",
    emoji: "😐",
    badgeClass: "bg-muted text-muted-foreground",
  },
  {
    value: "rough",
    label: "Rough",
    emoji: "😮‍💨",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  },
  {
    value: "terrible",
    label: "Terrible",
    emoji: "🤕",
    badgeClass: "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300",
  },
];

export function feelingMeta(feeling: Feeling): FeelingMeta | undefined {
  return FEELINGS.find((f) => f.value === feeling);
}
