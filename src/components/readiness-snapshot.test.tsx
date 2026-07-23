// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReadinessSnapshot } from "@/components/readiness-snapshot";
import type { Readiness } from "@/lib/readiness";

afterEach(cleanup);

const readiness: Readiness = {
  score: 72,
  band: "ready",
  components: [
    { key: "hrv", sub: 60, weight: 0.3 },
    { key: "sleep", sub: 40, weight: 0.25 },
    { key: "rhr", sub: 85, weight: 0.15 },
  ],
  lowConfidence: false,
  redFlag: null,
  topNegative: "sleep",
};

describe("ReadinessSnapshot", () => {
  it("renders the score, band and component breakdown", () => {
    render(<ReadinessSnapshot readiness={readiness} />);
    const meter = screen.getByRole("meter", { name: /readiness/i });
    expect(meter.getAttribute("aria-valuenow")).toBe("72");
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("HRV")).toBeTruthy();
    // "Sleep" appears both as a component row and in the "most limiting" note.
    expect(screen.getAllByText("Sleep").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/most limiting/i)).toBeTruthy();
  });

  it("surfaces a red-flag reason when present", () => {
    render(<ReadinessSnapshot readiness={{ ...readiness, redFlag: { reason: "sickness" } }} />);
    expect(screen.getByText(/flagged illness/i)).toBeTruthy();
  });

  it("shows the low-confidence note", () => {
    render(<ReadinessSnapshot readiness={{ ...readiness, lowConfidence: true }} />);
    expect(screen.getByText(/limited data/i)).toBeTruthy();
  });
});
