import { describe, expect, it } from "vitest";
import {
  fmtDate,
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
  // Local-time ISO strings (no trailing Z) parse to the exact calendar
  // components in any timezone, so these assertions are deterministic and
  // avoid the UTC date-only edge case (fixed later in T3.4).
  it("formats a weekday, day and month", () => {
    expect(fmtDate("2026-05-15T12:00:00", "en")).toBe("Fri 15 May");
    expect(fmtDate("2026-05-15T12:00:00", "pt")).toBe("Sex 15 Mai");
  });

  it("formats a day and month from a Date", () => {
    expect(fmtDayMonth(new Date(2026, 4, 15), "en")).toBe("15 May");
    expect(fmtDayMonth(new Date(2026, 4, 15), "pt")).toBe("15 Mai");
  });

  it("formats a wall-clock time", () => {
    expect(fmtTime("2026-05-15T08:05:00")).toBe("08:05");
  });
});
