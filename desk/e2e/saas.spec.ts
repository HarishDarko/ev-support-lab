// SD-15, SaaS support: the full walkthrough of the token-refresh storm incident (INC-0527), from the queue to the
// knowledge base article, on its rules-only recording. Live runs stay off for this industry until its AI
// recording is reviewed, and the page says so.
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

test("the SaaS walkthrough tells its own incident, beat by beat, with no live run", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?pack=saas-support");
  await expect(heading(page)).toHaveText("25 tickets are waiting.");
  await expect(page.getByRole("button", { name: "Rules · recorded run" })).toBeVisible();

  // Every beat in order; the claim changes with an animation, so each check waits for the beat's own text.
  const stage = page.locator("#stage");
  const CLAIMS: Record<string, string> = {
    q1: "25 tickets are waiting.",
    t2: "3 closures held. RB-14 has closed this 4 times in 21 days.",
    e1: "One pattern, one incident: INC-0527.",
    e3: "Every delivery asked for its own token. The customer's identity provider said stop.",
    e3b: "At Saffron Foods, nothing reached the server before the pause.",
    e4: "19 of 212 burst expiries paused an endpoint.",
    v3: "Canary 9 → 0. Control 8 → 9.",
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

test("the SaaS desk opens on its incident, with the lab's logs and the synthetic label", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?pack=saas-support&desk=incident");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("INC-0527").first()).toBeVisible();
  await expect(dialog.getByText(/^Synthetic excerpts as the webhook delivery service/)).toBeVisible();
  await expect(dialog.getByText("Harbor Analytics · ep_harbor_main · T-3004").first()).toBeVisible();
  await expect(dialog.getByRole("table", { name: /Endpoints, token expiries and pauses/ })).toBeVisible();

  await dialog.getByRole("tab", { name: "Queue" }).click();
  const table = dialog.getByRole("table").first();
  await expect(table.getByRole("row")).toHaveCount(26);
  await expect(table.getByRole("columnheader", { name: "Account" })).toBeVisible();
  await expect(table.getByRole("row", { name: /T-3023/ })).toContainText("Held");
  await expect(dialog.getByRole("button", { name: "Run it live" })).toHaveCount(0);

  // The new-ticket check answers from the rules without calling the server, since live runs are off here.
  await dialog.getByRole("tab", { name: "Knowledge base", exact: true }).click();
  await dialog.getByRole("button", { name: "Check against the article" }).click();
  const result = dialog.getByTestId("classify-result");
  await expect(result).toContainText("Checked just now");
  await expect(result).toContainText("Matches the article");
  await expect(result).toContainText("Live AI runs are not switched on for this industry yet.");
  expect(errors).toEqual([]);
});

test("a ?desk= link opens the desk once: switching industry does not open it again", async ({ page }) => {
  await page.goto("/?desk=queue");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("combobox", { name: "Industry" }).first().selectOption("saas-support");
  await expect(heading(page)).toHaveText("25 tickets are waiting.");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("combobox", { name: "Industry" }).first().selectOption("ev-charging");
  await expect(heading(page)).toHaveText("40 tickets are waiting.");
  await expect(dialog).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the SaaS walkthrough passes axe (WCAG 2.2 AA) in the ${scheme} theme, board and desk`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?pack=saas-support");
    await page
      .getByRole("navigation", { name: "Walkthrough and pages" })
      .getByRole("button", { name: /Evidence/ })
      .click();
    await expect(heading(page)).toHaveText("One pattern, one incident: INC-0527.");
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    await settled(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.keyboard.press("d");
    await expect(page.getByRole("dialog", { name: "The desk" })).toBeVisible();
    await settled(page);
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });
}

test("the SaaS walkthrough has no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?pack=saas-support");
  await expect(page.getByText("25 tickets are waiting.").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the server runs the SaaS incident steps from the rules under MOCK=1", async ({ request }) => {
  const res = await request.post("/api/investigate", { data: { pack: "saas-support" } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { symptom: string }; trace: { source: string; cost: number } };
  expect(body.trace).toMatchObject({ source: "rules", cost: 0 });
  expect(body.data.symptom).toMatch(/webhook endpoints are paused/);
});
