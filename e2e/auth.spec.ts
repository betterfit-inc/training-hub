import { test, expect } from "@playwright/test";

// T1.6 — the auth boundary. The e2e server sets AUTH_PASSWORD / AUTH_SECRET
// (playwright.config.ts), so auth is CONFIGURED here. Reads stay open (only
// mutating server actions are gated), which is why the other specs still pass
// without logging in; this spec covers the login flow itself.
//
// The exhaustive reject/allow proof for the gated actions lives in the node
// unit test (src/lib/actions.auth.test.ts); here we assert the /login page
// renders, rejects a wrong password, and on the correct password establishes a
// session cookie and lands on the home log.
test.describe("auth", () => {
  const PASSWORD = "e2e-owner-password";

  test("/login renders the password form", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByText("This is a private training log. Enter the owner password to continue.")
    ).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("a wrong password is rejected and sets no session", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "th_session")).toBe(false);
  });

  test("the correct password logs in, sets the session cookie, and redirects home", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    // loginAction redirects to "/" only after createSession() succeeds.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Training log" })).toBeVisible();

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "th_session");
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);

    // The header now offers a Log out control for the authenticated owner.
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});
