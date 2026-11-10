// SD-11 and SD-13: the Industry choice. Three complete industries: EV charging (the full walkthrough), SaaS support
// and e-commerce (queue, patterns, article, new-ticket check and scorecard from the keyword rules).
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

const menu = (page: Page) => page.getByRole("combobox", { name: "Industry" }).first();

for (const link of [
  "/?desk=queue",
  "/?desk=queue&pack=ev-charging",
  "/?desk=queue&pack=nope",
  "/?desk=queue&pack=__proto__",
]) {
  test(`${link} opens the EV desk with its own columns`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(link);
    const dialog = page.getByRole("dialog", { name: "The desk" });
    await expect(dialog).toBeVisible();
    const table = dialog.getByRole("table").first();
    await expect(table.getByRole("row")).toHaveCount(41);
    await expect(table.getByRole("columnheader", { name: "Site" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Firmware" })).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveValue("ev-charging");
    expect(errors).toEqual([]);
  });
}

test("the Industry menu offers the three complete industries, EV charging first", async ({ page }) => {
  await page.goto("/");
  await expect(menu(page)).toHaveValue("ev-charging");
  await expect(menu(page).getByRole("option")).toHaveText(["EV charging", "SaaS support", "E-commerce"]);
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
});

test("picking SaaS support shows its queue and scorecard, keeps the pick on reload, and switches back", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await menu(page).selectOption("saas-support");
  await expect(page).toHaveURL(/\?pack=saas-support(#.*)?$/);
  await expect(page.getByRole("heading", { name: "21 tickets are waiting." })).toBeVisible();
  const queue = page.getByRole("table", { name: "Open tickets with the rules' triage for each" });
  await expect(queue.getByRole("row")).toHaveCount(22);
  await expect(queue.getByRole("columnheader", { name: "Account" })).toBeVisible();
  await expect(queue.getByRole("row", { name: /T-3004/ })).toContainText("RB-14");
  const score = page.getByRole("table", { name: "Keyword rules against the reviewed labels" });
  await expect(score.getByRole("row", { name: /All four right/ })).toContainText("6 of 21");
  await expect(page.getByText(/in-sample/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "21 tickets are waiting." })).toBeVisible();
  await expect(menu(page)).toHaveValue("saas-support");

  await page.getByRole("button", { name: "Switch to EV charging" }).click();
  await expect(page).not.toHaveURL(/pack=/);
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the e-commerce desk passes axe (WCAG 2.2 AA) in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?pack=e-commerce");
    await expect(page.getByRole("heading", { name: "21 tickets are waiting." })).toBeVisible();
    const score = page.getByRole("table", { name: "Keyword rules against the reviewed labels" });
    await expect(score.getByRole("row", { name: /All four right/ })).toContainText("7 of 21");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("the e-commerce desk has no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?pack=e-commerce");
  await expect(page.getByRole("heading", { name: "21 tickets are waiting." })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("in SaaS support the rules button jumps to the scorecard, and the EV desk does not pop open later", async ({
  page,
}) => {
  await page.goto("/?desk=queue&pack=saas-support");
  await expect(page.getByRole("heading", { name: "21 tickets are waiting." })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "The desk" })).toHaveCount(0);
  await page.getByRole("button", { name: "Rules · no recorded run yet" }).click();
  await expect(page.getByRole("heading", { name: "Scorecard" })).toBeInViewport();
  await expect(page.getByRole("dialog", { name: "The desk" })).toHaveCount(0);
  await menu(page).selectOption("ev-charging");
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "The desk" })).toHaveCount(0);
});
