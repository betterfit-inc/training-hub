// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above. All other
// `src/**/*.test.ts` suites keep the node environment from vitest.config.ts.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActivityChart } from "@/components/activity-chart";
import type { ActivityStreams } from "@/lib/streams";

afterEach(cleanup);

const N = 5;
const ramp = (a: number, b: number) =>
  Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));

// Base grid every activity shares (distance + time present), with all optional
// series absent by default so each case turns on only what it needs.
function makeStreams(overrides: Partial<ActivityStreams>): ActivityStreams {
  return {
    n: N,
    distanceKm: ramp(0, 4),
    timeS: ramp(0, 1200),
    heartrate: null,
    paceSPerKm: null,
    watts: null,
    cadence: null,
    altitudeM: null,
    ...overrides,
  };
}

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("ActivityChart default-series resync on activity change", () => {
  it("resyncs the default selected series when the activity changes (client nav reuses the instance)", () => {
    // Activity A, a run: HR + pace + elevation present. Run default emphasizes
    // heart rate / pace / elevation. No power/cadence streams => no such toggles.
    const runStreams = makeStreams({
      heartrate: ramp(120, 160),
      paceSPerKm: ramp(300, 280),
      altitudeM: ramp(10, 40),
    });

    const { rerender } = render(
      <ActivityChart activityId={1} streams={runStreams} isRun={true} isRide={false} />
    );

    // Sanity: the run's own default is active on first mount.
    expect(pressed("Pace")).toBe("true");
    expect(pressed("Heart rate")).toBe("true");
    expect(pressed("Elevation")).toBe("true");
    expect(screen.queryByRole("button", { name: "Power" })).toBeNull();

    // Activity B, a ride: power + HR + cadence + elevation present. Ride
    // default emphasizes power / heart rate / cadence / elevation.
    const rideStreams = makeStreams({
      watts: ramp(180, 240),
      heartrate: ramp(130, 165),
      cadence: ramp(80, 92),
      altitudeM: ramp(5, 30),
    });

    // Re-render the SAME instance (same tree position) with B's props, exactly
    // as client-side navigation between two /activity/[id] pages would.
    rerender(<ActivityChart activityId={2} streams={rideStreams} isRun={false} isRide={true} />);

    // The chart must now show the NEW activity's default (power + cadence),
    // not the stale run default carried over from A.
    expect(pressed("Power")).toBe("true");
    expect(pressed("Cadence")).toBe("true");
    expect(pressed("Heart rate")).toBe("true");
  });

  it("selects the time axis when the new activity has no distance stream", () => {
    // Activity A: a normal run with a distance stream (distance axis default).
    const withDistance = makeStreams({
      heartrate: ramp(120, 160),
      altitudeM: ramp(10, 40),
    });
    const { rerender, container } = render(
      <ActivityChart activityId={1} streams={withDistance} isRun={true} isRide={false} />
    );
    expect(pressed("Distance")).toBe("true");

    // Activity B: a treadmill run — time present, distance stream all null. The
    // resync used to force xMode back to "distance", leaving an empty x-axis and
    // a blank chart. It must fall back to the time axis instead.
    const timeOnly = makeStreams({
      distanceKm: Array.from({ length: N }, () => null),
      timeS: ramp(0, 1200),
      heartrate: ramp(120, 160),
    });
    rerender(<ActivityChart activityId={2} streams={timeOnly} isRun={true} isRide={false} />);

    // Time is the active x-axis; the distance toggle is absent (no usable data).
    expect(pressed("Time")).toBe("true");
    expect(screen.queryByRole("button", { name: "Distance" })).toBeNull();
    // A series is actually drawn, not a blank chart.
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });
});
