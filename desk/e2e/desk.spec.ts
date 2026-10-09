// The desk sheet, opened by a ?desk=<tab> link, against the built site under MOCK=1: no key, no spend.
import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Every tab, and one thing that proves its content is there. */
const TABS = [
  { name: "Queue", heading: "Queue" },
  { name: "Incident", heading: "Investigation" },
  { name: "Handoff", heading: "The ask" },
  { name: "Knowledge base", heading: "A new ticket arrives" },
  { name: "Coverage", heading: "Coverage over 24 hours, Eastern time" },
  { name: "Scorecard", heading: "Model accuracy" },
] as const;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => errors.push(`requestfailed: ${req.url()}`));
  return errors;
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "The desk" });
const opener = (page: Page) => page.getByRole("button", { name: "Open the desk" });

/** Waits for the slide-in to finish, so measurements and contrast checks see the sheet at rest. */
async function atRest(page: Page): Promise<Locator> {
  const dialog = sheet(page);
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      return box ? Math.round(box.x + box.width) === width : false;
    })
    .toBe(true);
  return dialog;
}

const tab = (page: Page, name: string) => sheet(page).getByRole("tab", { name, exact: true });

test("opens on the requested tab, visits every tab, and Esc closes it with focus back on the opener", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?desk=queue");
  const dialog = await atRest(page);

  await expect(dialog.getByTestId("desk-synthetic")).toContainText("Synthetic data");
  await expect(tab(page, "Queue")).toHaveAttribute("aria-selected", "true");
  // Focus has moved into the sheet.
  await expect(dialog).toBeFocused();

  for (const { name, heading } of TABS) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("tabpanel")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();

  // And again from a click, so the opener is remembered each time.
  await opener(page).click();
  await atRest(page);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();

  expect(errors).toEqual([]);
});

test("an unknown tab falls back to the queue", async ({ page }) => {
  await page.goto("/?desk=nonsense");
  await atRest(page);
  await expect(tab(page, "Queue")).toHaveAttribute("aria-selected", "true");
});

test("arrow keys move between tabs, and Tab stays inside the sheet", async ({ page }) => {
  await page.goto("/?desk=queue");
  const dialog = await atRest(page);

  await tab(page, "Queue").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Incident")).toBeFocused();
  await expect(tab(page, "Incident")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tab(page, "Scorecard")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Queue")).toBeFocused();

  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
});

test("the queue shows every ticket, highlights the quote in place, and explains a held closure", async ({ page }) => {
  await page.goto("/?desk=queue");
  const dialog = await atRest(page);

  await expect(dialog.getByRole("table").first().getByRole("row")).toHaveCount(41); // header + 40 tickets
  // It opens on the first held ticket, with the repeat rule spelled out from the closed history.
  await expect(dialog.getByText(/Held: RB-05 has closed this \d+ times in 21 days/)).toBeVisible();
  await expect(dialog.getByText("Synthetic").first()).toBeVisible();

  await dialog.getByRole("button", { name: "Held", exact: false }).first().click();
  const rows = await dialog.getByRole("table").first().getByRole("row").count();
  expect(rows).toBeLessThan(41);

  await dialog.getByRole("button", { name: "All" }).click();
  await dialog.getByRole("button", { name: "T-2054" }).click();
  await expect(dialog.getByTestId("inspector-text")).toContainText("Elevated 5xx");
});

test("the knowledge base checks a new ticket live, and says when the rules answered instead", async ({ page }) => {
  await page.goto("/?desk=kb");
  const dialog = await atRest(page);

  const box = dialog.getByLabel("New ticket text");
  await expect(box).toHaveValue(/NOC: session SX-89412/);
  await expect(dialog.getByTestId("classify-result")).toContainText("Recorded result for this example");

  await box.fill("Host asks how to change their invoice address.");
  await expect(dialog.getByText("The text has changed. Check it again")).toBeVisible();
  await dialog.getByRole("button", { name: "Check against the article" }).click();
  // Under MOCK=1 the server answers from the rules, and the result is labelled that way.
  const result = dialog.getByTestId("classify-result");
  await expect(result).toContainText("Checked just now");
  await expect(result).toContainText("Rules fallback");
  await expect(result).toContainText("AI is turned off in this environment");
});

test("Run it live keeps working when the model is off, and says so in one line", async ({ page }) => {
  await page.goto("/?desk=queue");
  const dialog = await atRest(page);

  await dialog.getByRole("button", { name: "Run it live" }).click();
  await expect(dialog.getByText(/No live model answered \(AI is turned off in this environment\.\)/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Run it live" })).toBeEnabled();
  await expect(dialog.getByRole("table").first().getByRole("row")).toHaveCount(41);
});

test("the scorecard says Not measured yet and shows this run's cost per step", async ({ page }) => {
  await page.goto("/?desk=scorecard");
  const dialog = await atRest(page);
  await expect(dialog.getByText("Not measured yet.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Method" })).toBeVisible();
  const table = dialog.getByRole("table", { name: "Cost of this run, per step" });
  await expect(table.getByRole("row")).toHaveCount(10); // header + 8 steps + total
  await expect(table.getByRole("row", { name: /Whole run/ })).toContainText("$");
});

for (const scheme of ["light", "dark"] as const) {
  test(`no accessibility violations on any tab (WCAG 2.2 AA), ${scheme} theme`, async ({ page }) => {
    // Six full axe runs in one test: under parallel load this can pass 30 s, so it gets a longer budget.
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?desk=queue");
    const dialog = await atRest(page);
    for (const { name } of TABS) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${name} tab`).toEqual([]);
    }
    await expect(dialog).toBeVisible();
  });
}

test("full screen with no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?desk=queue");
  const dialog = await atRest(page);
  expect((await dialog.boundingBox())?.width).toBe(390);

  for (const { name } of TABS) {
    await tab(page, name).click();
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>("[role=tabpanel]");
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panel: panel ? panel.scrollWidth - panel.clientWidth : 0,
      };
    });
    expect(overflow, `${name} tab`).toEqual({ page: 0, panel: 0 });
  }
});

test("opens with a crossfade under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?desk=incident");
  const dialog = await atRest(page);
  await expect(dialog.getByRole("heading", { name: "Investigation" })).toBeVisible();
  await expect(dialog.getByText("Not confirmed").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
});
