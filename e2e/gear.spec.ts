import { test, expect } from "@playwright/test";

// Shoes and bikes are created by the baseline migration that the seed runs, so
// they are present regardless of any Strava connection.
test("shoes page shows a seeded baseline shoe", async ({ page }) => {
  await page.goto("/shoes");

  await expect(page.getByRole("heading", { level: 1, name: "Shoes" })).toBeVisible();
  await expect(page.getByText("ASICS Superblast 3")).toBeVisible();
});

test("bikes page shows a seeded baseline bike", async ({ page }) => {
  await page.goto("/bikes");

  await expect(page.getByRole("heading", { level: 1, name: "Bikes" })).toBeVisible();
  await expect(page.getByText("TSW TR10 Speed Bike")).toBeVisible();
});
