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

test("the SaaS walkthrough tells its own incident, beat by beat, with no live run", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?pack=saas-support");
  await expect(heading(page)).toHaveText("25 tickets are waiting.");
  await expect(page.getByRole("button", { name: "Rules · recorded run" })).toBeVisible();

  const claims: string[] = [];
  for (let i = 0; i < 18; i += 1) {
    claims.push((await heading(page).textContent()) ?? "");
    if (i === 2) {
      // t1: the run control says why there is no live run, and offers none.
      await expect(page.getByText(/Live runs are off for this industry/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Run it live" })).toHaveCount(0);
    }
    await page.keyboard.press("ArrowRight");
  }
  expect(claims).toContain("3 closures held. RB-14 has closed this 4 times in 21 days.");
  expect(claims).toContain("One pattern, one incident: INC-0527.");
  expect(claims).toContain("Every delivery asked for its own token. The customer's identity provider said stop.");
  expect(claims).toContain("Canary 9 → 0. Control 8 → 9.");
  expect(claims).toContain("Next time, support has the article.");
  for (const c of claims) expect(c).not.toMatch(/charger|meter|INC-0412|sites?\b/i);
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
  expect(errors).toEqual([]);
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
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await page.keyboard.press("d");
    await expect(page.getByRole("dialog", { name: "The desk" })).toBeVisible();
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
