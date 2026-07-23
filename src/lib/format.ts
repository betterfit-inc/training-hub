import type { Lang } from "./i18n";

const DAYS: Record<Lang, readonly string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  pt: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
};
const DAYS_LONG: Record<Lang, readonly string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  pt: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
};
const MONTHS: Record<Lang, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
};
const MONTHS_LONG: Record<Lang, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  pt: [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ],
};
const THIS_WEEK: Record<Lang, string> = { en: "This week", pt: "Esta semana" };
const LAST_WEEK: Record<Lang, string> = { en: "Last week", pt: "Semana passada" };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtKm(km: number | null | undefined, digits = 1): string {
  if (km == null) return "–";
  return `${km.toFixed(digits)} km`;
}

export function fmtPace(sPerKm: number | null | undefined): string {
  if (!sPerKm || sPerKm <= 0) return "–";
  const total = Math.round(sPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, "0")} /km`;
}

/** "4:39" (no unit), for pace inputs and compact display. */
export function fmtPaceShort(sPerKm: number | null | undefined): string {
  if (!sPerKm || sPerKm <= 0) return "";
  const total = Math.round(sPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Parses "m:ss" or "mm:ss" pace into seconds per km; null if invalid. */
export function parsePace(input: string): number | null {
  const match = /^(\d{1,2}):([0-5]?\d)$/.exec(input.trim());
  if (!match) return null;
  const s = Number(match[1]) * 60 + Number(match[2]);
  return s > 0 ? s : null;
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return "–";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtHoursMin(s: number | null | undefined): string {
  if (!s || s <= 0) return "–";
  let h = Math.floor(s / 3600);
  let m = Math.round((s % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function fmtHr(hr: number | null | undefined): string {
  if (!hr) return "–";
  return `${Math.round(hr)} bpm`;
}

export function fmtElev(m: number | null | undefined): string {
  if (m == null) return "–";
  return `${Math.round(m)} m`;
}

// fmtDate/fmtDateLong/fmtTime/fmtDateWithYear format a STORED UTC instant
// (Strava start_date, a Z-suffixed ISO). They read it with UTC getters so the
// rendered day/weekday/time are stable across runtimes (server=UTC vs browser=
// athlete tz) and guard an unparseable ISO with the same placeholder as an
// absent one, instead of rendering "undefined NaN undefined" / "NaN:NaN".
export function fmtDate(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return `${DAYS[lang][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]}`;
}

export function fmtDateLong(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  if (lang === "pt") {
    return `${DAYS_LONG.pt[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS_LONG.pt[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }
  return `${DAYS_LONG.en[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG.en[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// fmtDayMonth takes a wall-clock Date the caller already built locally
// (parseLocalDate / new Date(y, m, d)), so it stays on local getters.
export function fmtDayMonth(d: Date, lang: Lang = "en"): string {
  return `${d.getDate()} ${MONTHS[lang][d.getMonth()]}`;
}

export function fmtDateWithYear(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return `${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// localDateInputValue / mondayOf / weekLabel manipulate a local wall-clock Date
// (an <input type=date> value, a week picker) — intentionally local, not UTC.
export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

/** Parse a local YYYY-MM-DD day key back into a local wall-clock Date. Inverse of localDateInputValue. */
export function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Inclusive list of local YYYY-MM-DD day keys from `from` to `to`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cursor <= end) {
    out.push(localDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function weekLabel(monday: Date, lang: Lang = "en", now = new Date()): string {
  const thisMonday = mondayOf(now);
  const diffDays = Math.round((thisMonday.getTime() - monday.getTime()) / 86400000);
  if (diffDays === 0) return THIS_WEEK[lang];
  if (diffDays === 7) return LAST_WEEK[lang];
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const left = sameMonth ? String(monday.getDate()) : fmtDayMonth(monday, lang);
  const right = fmtDayMonth(sunday, lang);
  const year = monday.getFullYear() === now.getFullYear() ? "" : ` ${monday.getFullYear()}`;
  return `${left}–${right}${year}`;
}
