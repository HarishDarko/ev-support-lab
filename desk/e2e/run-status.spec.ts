// While "Run it live" runs, both run controls say which step is running and about how long is left.
// MOCK=1 answers every call from the rules at once, so the investigation call is held back here to see it running.
import { test, expect, type Page } from "@playwright/test";

/** Holds every /api/investigate answer until `release` is called. */
async function holdInvestigation(page: Page) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/investigate", async (route) => {
    const response = await route.fetch();
    await released;
    await route.fulfill({ response });
  });
  return release;
}

test("the stage's Run it live names the running step and the time left, then finishes", async ({ page }) => {
  const release = await holdInvestigation(page);
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("main[data-beat='t1']")).toBeVisible();

  await page.getByRole("button", { name: "Run it live" }).click();
  const control = page.locator(".run-control");
  await expect(control).toContainText("writing the investigation");
  await expect(control).toContainText(/of 15 answers in, (about \d+ seconds? left|almost done)\./);
  await expect(control).not.toContainText("calls answered");

  release();
  await expect(page.getByRole("button", { name: "Run it live" })).toBeEnabled();
  await expect(control).toContainText("No live model answered");
});

test("the desk's Run it live shows the same status line", async ({ page }) => {
  const release = await holdInvestigation(page);
  await page.goto("/?desk=queue");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await dialog.getByRole("button", { name: "Run it live" }).click();
  await expect(dialog.locator(".runbar-status")).toContainText("writing the investigation");
  await expect(dialog.locator(".runbar-status")).toContainText(/of 15 answers in/);
  release();
  await expect(dialog.getByRole("button", { name: "Run it live" })).toBeEnabled();
});
