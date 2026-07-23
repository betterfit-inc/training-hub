import { test, expect } from "@playwright/test";

// End-to-end for the health/readiness/recovery layer: POST a trailing window of
// synthetic device snapshots to the real ingest endpoint (machine token), then
// assert the /health page renders readiness, recovery and the metric panel from
// them. Runs in the authenticated `chromium` project so the page gate allows
// /health; the ingest endpoint is allowlisted in the proxy and uses its own token.

const INGEST_TOKEN = "e2e-health-ingest-secret";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

test.describe("health", () => {
  test.beforeAll(async ({ request }) => {
    // 21 trailing days of Garmin-shaped snapshots, gently varying so trends move.
    for (let i = 20; i >= 0; i--) {
      const wobble = Math.sin(i / 3);
      const res = await request.post("/api/health/ingest", {
        headers: { authorization: `Bearer ${INGEST_TOKEN}` },
        data: {
          date: isoDate(i),
          source: "garmin",
          sleep: {
            totalMin: Math.round(450 + wobble * 40),
            deepMin: 80,
            remMin: 95,
            score: Math.round(78 + wobble * 8),
          },
          hrv: { overnightAvgMs: Math.round(60 + wobble * 6), status: "BALANCED" },
          restingHr: Math.round(48 - wobble * 2),
          stress: { avg: Math.round(30 - wobble * 5) },
          bodyBattery: { low: 20, high: Math.round(90 + wobble * 5) },
          steps: 9000,
          trainingReadiness: { score: Math.round(70 + wobble * 10), recoveryTimeHrs: 12 },
          trainingStatus: { status: "PRODUCTIVE" },
        },
      });
      expect(res.ok()).toBeTruthy();
    }
    // A manual subjective check-in for today.
    const manual = await request.post("/api/health/ingest", {
      headers: { authorization: `Bearer ${INGEST_TOKEN}` },
      data: {
        date: isoDate(0),
        source: "manual",
        subjective: { fatigue: 2, soreness: 2, stress: 2, mood: 4 },
      },
    });
    expect(manual.ok()).toBeTruthy();
  });

  test("renders readiness, recovery and the metric panel", async ({ page }) => {
    await page.goto("/health");

    // Readiness meter with a 0-100 score.
    const meter = page.getByRole("meter", { name: /readiness/i });
    await expect(meter).toBeVisible();
    const score = Number(await meter.getAttribute("aria-valuenow"));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);

    // Metric panel shows a resolved sleep tile and a source label.
    await expect(page.getByText("Sleep", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Garmin").first()).toBeVisible();

    // Recovery card is present (CardTitle renders as a styled div, not a heading).
    await expect(page.getByText("Recovery", { exact: true })).toBeVisible();
  });

  test("the global recovery badge appears in the header", async ({ page }) => {
    await page.goto("/health");
    await expect(page.getByRole("button", { name: /recovery remaining/i })).toBeVisible();
  });
});
