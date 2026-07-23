// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HealthMetricsPanel } from "@/components/health-metrics-panel";
import type { HealthMetricRow } from "@/lib/types";

afterEach(cleanup);

function row(over: Partial<HealthMetricRow>): HealthMetricRow {
  return {
    id: 0,
    date: "2026-07-23",
    metric: "resting_hr",
    value: 48,
    value_text: null,
    unit: "bpm",
    source: "garmin",
    recorded_at: null,
    ...over,
  };
}

describe("HealthMetricsPanel", () => {
  it("renders values, units and per-tile source labels", () => {
    render(
      <HealthMetricsPanel
        rows={[
          row({ metric: "resting_hr", value: 48, source: "garmin" }),
          row({ metric: "sleep_total", value: 452, unit: "min", source: "garmin" }),
          row({ metric: "hrv_status", value: null, value_text: "BALANCED", source: "garmin" }),
          row({ metric: "fatigue", value: 2, source: "manual" }),
        ]}
      />
    );
    expect(screen.getByText("48")).toBeTruthy(); // resting HR value
    expect(screen.getByText("7h 32m")).toBeTruthy(); // sleep minutes -> h m
    expect(screen.getByText("BALANCED")).toBeTruthy(); // categorical text
    expect(screen.getAllByText("Garmin").length).toBeGreaterThan(0);
    expect(screen.getByText("Manual")).toBeTruthy();
  });
});
