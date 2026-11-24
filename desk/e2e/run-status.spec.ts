// While "Run it live" runs, both run controls say which step is running and about how long is left.
// MOCK=1 answers every call from the rules at once, so the investigation call is held back here to see it running.
import { type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { openFromChooser } from "./chooser";

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
  await openFromChooser(page, "/");
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
  await openFromChooser(page, "/?desk=queue");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await dialog.getByRole("button", { name: "Run it live" }).click();
  await expect(dialog.locator(".runbar-status")).toContainText("writing the investigation");
  await expect(dialog.locator(".runbar-status")).toContainText(/of 15 answers in/);
  release();
  await expect(dialog.getByRole("button", { name: "Run it live" })).toBeEnabled();
});

test("the knowledge base's example follows a live run that lands while the tab is open", async ({ page }) => {
  // MOCK=1 answers from the rules, which never replace a recorded AI answer, so the classify answer is held and then
  // returned as an AI answer with a marked suggested action.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/classify", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { data: Record<string, unknown>; trace: Record<string, unknown> };
    await released;
    body.data["suggested_action"] = "Answer from the live run.";
    body.trace = { ...body.trace, source: "ai", reliability: "high", fallbackReason: undefined };
    await route.fulfill({ response, json: body });
  });
  await openFromChooser(page, "/");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("main[data-beat='t1']")).toBeVisible();
  await page.getByRole("button", { name: "Run it live" }).click();

  await page.getByRole("button", { name: "Open the desk" }).click();
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await dialog.getByRole("tab", { name: "Knowledge base", exact: true }).click();
  const result = dialog.getByTestId("classify-result");
  await expect(result).toContainText("Recorded result for this example");

  release();
  await expect(result).toContainText("Result for this example from the live run");
  await expect(result).toContainText("Answer from the live run.");
});
