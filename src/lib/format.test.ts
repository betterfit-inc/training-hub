import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fmtDate,
  fmtDateLong,
  fmtDateWithYear,
  fmtDayMonth,
  fmtDuration,
  fmtHoursMin,
  fmtPace,
  fmtPaceShort,
  fmtTime,
  parsePace,
  round2,
} from "@/lib/format";

describe("pace formatting", () => {
  it("formats seconds-per-km into m:ss", () => {
    expect(fmtPaceShort(269)).toBe("4:29");
    expect(fmtPace(269)).toBe("4:29 /km");
  });

  it("pads the seconds component", () => {
    expect(fmtPaceShort(305)).toBe("5:05");
  });

  it("returns placeholders for non-positive paces", () => {
    expect(fmtPaceShort(0)).toBe("");
    expect(fmtPace(0)).toBe("–");
  });

  it("round-trips through parsePace", () => {
    expect(parsePace("4:29")).toBe(269);
    expect(parsePace("not a pace")).toBeNull();
  });
});

describe("duration formatting", () => {
  it("formats durations over an hour as h:mm:ss", () => {
    expect(fmtDuration(5915)).toBe("1:38:35");
  });

  it("formats sub-hour durations as m:ss", () => {
    expect(fmtDuration(155)).toBe("2:35");
  });

  it("formats hours and minutes compactly", () => {
    expect(fmtHoursMin(5915)).toBe("1h 39m");
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.2345)).toBe(1.23);
    expect(round2(10)).toBe(10);
  });
});

describe("date formatting", () => {
  // fmtDate/fmtTime format a STORED UTC instant (Strava start_date, Z-suffixed),
  // so they read it with UTC getters and render the same value in any timezone.
  it("formats a weekday, day and month from a UTC instant", () => {
    expect(fmtDate("2026-05-15T12:00:00Z", "en")).toBe("Fri 15 May");
    expect(fmtDate("2026-05-15T12:00:00Z", "pt")).toBe("Sex 15 Mai");
  });

  // fmtDayMonth takes a wall-clock Date the caller built locally (parseLocalDate),
  // so it deliberately stays on local getters.
  it("formats a day and month from a local wall-clock Date", () => {
    expect(fmtDayMonth(new Date(2026, 4, 15), "en")).toBe("15 May");
    expect(fmtDayMonth(new Date(2026, 4, 15), "pt")).toBe("15 Mai");
  });

  it("formats a wall-clock time from a UTC instant", () => {
    expect(fmtTime("2026-05-15T08:05:00Z")).toBe("08:05");
  });
});

// T3.4 regression: stored UTC instants must render consistently regardless of
// the process timezone. We force a non-UTC zone (Asia/Tokyo, UTC+9, no DST) so
// that the buggy local-getter code shifts an evening-UTC instant into the next
// calendar day/time and FAILS; the UTC-getter fix keeps it stable and PASSES.
describe("timezone consistency (T3.4)", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Tokyo";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  // 2026-03-15T23:30:00Z is Sunday 15 March, 23:30 UTC.
  // In Asia/Tokyo it is Monday 16 March, 08:30 local — the drift the bug causes.
  const eveningUtc = "2026-03-15T23:30:00Z";

  it("renders the UTC calendar day, not the local-shifted day (fmtDate)", () => {
    expect(fmtDate(eveningUtc, "en")).toBe("Sun 15 Mar");
    expect(fmtDate(eveningUtc, "pt")).toBe("Dom 15 Mar");
  });

  it("renders the UTC weekday/day/year (fmtDateLong)", () => {
    expect(fmtDateLong(eveningUtc, "en")).toBe("Sunday, 15 March 2026");
  });

  it("renders the UTC day/month/year (fmtDateWithYear)", () => {
    expect(fmtDateWithYear(eveningUtc, "en")).toBe("15 Mar 2026");
  });

  it("renders the UTC wall-clock time, not the local-shifted time (fmtTime)", () => {
    expect(fmtTime(eveningUtc)).toBe("23:30");
  });
});

// T3.4 regression: an unparseable ISO must render a controlled placeholder
// instead of "undefined NaN undefined" (fmtDate/fmtDateLong/fmtDateWithYear) or
// "NaN:NaN" (fmtTime).
describe("invalid ISO handling (T3.4)", () => {
  it("renders the en-dash placeholder for unparseable dates", () => {
    expect(fmtDate("not-a-date", "en")).toBe("–");
    expect(fmtDateLong("not-a-date", "en")).toBe("–");
    expect(fmtDateWithYear("not-a-date", "en")).toBe("–");
  });

  it("renders an empty time for an unparseable instant", () => {
    expect(fmtTime("not-a-date")).toBe("");
  });
});
