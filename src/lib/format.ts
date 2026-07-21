const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTHS_LONG = [
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
] as const;

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

export function fmtDuration(s: number | null | undefined): string {
  if (!s || s <= 0) return "–";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtHr(hr: number | null | undefined): string {
  if (!hr) return "–";
  return `${Math.round(hr)} bpm`;
}

export function fmtElev(m: number | null | undefined): string {
  if (m == null) return "–";
  return `${Math.round(m)} m`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

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

export function weekLabel(monday: Date, now = new Date()): string {
  const thisMonday = mondayOf(now);
  const diffDays = Math.round((thisMonday.getTime() - monday.getTime()) / 86400000);
  if (diffDays === 0) return "This week";
  if (diffDays === 7) return "Last week";
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const left = sameMonth ? String(monday.getDate()) : fmtDayMonth(monday);
  const right = fmtDayMonth(sunday);
  const year = monday.getFullYear() === now.getFullYear() ? "" : ` ${monday.getFullYear()}`;
  return `${left}–${right}${year}`;
}
