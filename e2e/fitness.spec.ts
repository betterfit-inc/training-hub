import { test, expect } from "@playwright/test";

// The fitness dashboard reads persisted training loads. The seed inserts
// activities but not computed loads, so this asserts the page renders its header
// (the RSC — thresholds + PMC path — executes without error) rather than the
// populated stat tiles, which would require a load-computation step.
test("fitness dashboard renders without error", async ({ page }) => {
  await page.goto("/fitness");

  await expect(page.getByRole("heading", { level: 1, name: "Fitness" })).toBeVisible();
  await expect(page.getByText("Training load, fitness and form over time.")).toBeVisible();
});
