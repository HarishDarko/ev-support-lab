// SD-15, e-commerce: the full walkthrough of the second-authorization incident (INC-0539), from the queue to the
// knowledge base article, on its rules-only recording. Live runs stay off for this industry until its AI recording
// is reviewed, and the page says so.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** Waits until no finite animation is running, so axe reads colours at rest, not halfway through a fade. */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity).length,
      ),
    )
    .toBe(0);
}

test("the e-commerce walkthrough tells its own incident, beat by beat, with no live run", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?pack=e-commerce");
  await expect(heading(page)).toHaveText("22 tickets are waiting.");
  await expect(page.getByRole("button", { name: "Rules · recorded run" })).toBeVisible();

  // Every beat in order; the claim changes with an animation, so each check waits for the beat's own text.
  const stage = page.locator("#stage");
  const CLAIMS: Record<string, string> = {
    q1: "22 tickets are waiting.",
    t2: "4 closures held. RB-21 has closed this 3 times in 21 days.",
    e1: "One pattern, one incident: INC-0539.",
    e2: "Every stuck order's first payment answer came after the 8 s timeout.",
    e3: "The retry asked for a new payment, not the same one.",
    e3b: "In the app, the retry raced the first answer, and both were captured.",
    e4: "11 of 25 slow first answers became a second authorization.",
    v3: "Canary 1 → 0. Control 6 → 7.",
    v4: "Consistent with the hypothesis. Not proof of it.",
    c1: "Next time, support has the article.",
  };
  const BEATS = ["q1", "q2", "t1", "t2", "t3", "e1", "e2", "e3", "e3b", "e4", "e5", "e6", "v1", "v2", "v3", "v4"];
  for (const id of [...BEATS, "c1", "c2"]) {
    await expect(stage).toHaveAttribute("data-beat", id);
    if (CLAIMS[id]) await expect(heading(page)).toHaveText(CLAIMS[id]);
    if (id === "t1") {
      // The run control says why there is no live run, and offers none.
      await expect(page.getByText(/Live runs are off for this industry/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Run it live" })).toHaveCount(0);
    }
    if (id !== "c2") await page.keyboard.press("ArrowRight");
  }
  expect(errors).toEqual([]);
});

test("the e-commerce desk opens on its incident, with the lab's logs and the synthetic label", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?pack=e-commerce&desk=incident");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("INC-0539").first()).toBeVisible();
  await expect(dialog.getByText(/^Synthetic excerpts as checkout/)).toBeVisible();
  await expect(
    dialog.getByText("T-4002: web, order #51102, paid again after the error (synthetic)").first(),
  ).toBeVisible();
  await expect(
    dialog.getByRole("table", { name: /Checkouts, slow first answers and second authorizations/ }),
  ).toBeVisible();

  await dialog.getByRole("tab", { name: "Queue" }).click();
  const table = dialog.getByRole("table").first();
  await expect(table.getByRole("row")).toHaveCount(23);
  await expect(table.getByRole("columnheader", { name: "Order" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Channel" })).toBeVisible();
  await expect(table.getByRole("row", { name: /T-4022/ })).toContainText("Held");
  await expect(dialog.getByRole("button", { name: "Run it live" })).toHaveCount(0);

  // The new-ticket check answers from the rules without calling the server, since live runs are off here.
  await dialog.getByRole("tab", { name: "Knowledge base", exact: true }).click();
  await dialog.getByRole("button", { name: "Check against the article" }).click();
  const result = dialog.getByTestId("classify-result");
  await expect(result).toContainText("Checked just now");
  await expect(result).toContainText("Matches the article");
  await expect(result).toContainText("Live AI runs are not switched on for this industry yet.");

  await dialog.getByRole("tab", { name: "Scorecard" }).click();
  await expect(dialog.getByText(/reference-labels\.e-commerce\.json/)).toBeVisible();
  // The rules' score on the page is the one tests/packs-content.test.ts pins: 10 of 22 lenient, 7 strict.
  const score = dialog.getByRole("table", { name: "Triage accuracy against the reviewed labels" });
  await expect(score.getByRole("row", { name: /All four right/ })).toContainText("10 of 22 (45%)");
  await expect(dialog.getByText(/the rules on 7 of 22 \(32%\)/)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the e-commerce walkthrough passes axe (WCAG 2.2 AA) in the ${scheme} theme, board and desk`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?pack=e-commerce");
    await page
      .getByRole("navigation", { name: "Walkthrough and pages" })
      .getByRole("button", { name: /Evidence/ })
      .click();
    await expect(heading(page)).toHaveText("One pattern, one incident: INC-0539.");
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    await settled(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.keyboard.press("d");
    await expect(page.getByRole("dialog", { name: "The desk" })).toBeVisible();
    await settled(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}

test("the e-commerce walkthrough has no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?pack=e-commerce");
  await expect(page.getByText("22 tickets are waiting.").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the server runs the e-commerce incident steps from the rules under MOCK=1", async ({ request }) => {
  const res = await request.post("/api/investigate", { data: { pack: "e-commerce" } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { symptom: string }; trace: { source: string; cost: number } };
  expect(body.trace).toMatchObject({ source: "rules", cost: 0 });
  expect(body.data.symptom).toMatch(/held in Payment pending/);
});
