// SD-15, equal weight: the site opens on a choice of the three industries, a `?pack=` link goes straight to one,
// an old link keeps its desk tab once an industry is picked, and each industry's engineering notes describe its
// own lab. No page says the walkthrough is EV's.
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
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("the site opens on the three industries, each with its own case, and no walkthrough yet", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(heading(page)).toHaveText("Pick an industry");
  const cards = page.getByRole("list").getByRole("button");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveText(/^EV charging.*sessions stay open after a charger reconnects/);
  await expect(cards.nth(1)).toHaveText(/^SaaS support.*webhook endpoints are paused by a token-refresh storm/);
  await expect(cards.nth(2)).toHaveText(/^E-commerce.*stuck in Payment pending after checkout retries a slow payment/);
  // No walkthrough behind it: no industry's queue, no stage nav, no desk.
  await expect(page.getByText(/tickets are waiting\./)).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Walkthrough and pages" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "The desk" })).toHaveCount(0);
  await expect(page.getByText(/showcase/i)).toHaveCount(0);

  await cards.nth(2).click();
  await expect(page).toHaveURL(/\?pack=e-commerce(#.*)?$/);
  await expect(heading(page)).toHaveText("22 tickets are waiting.");
  // Focus moves to the new screen rather than being lost with the card.
  await expect(page.locator("#stage")).toBeFocused();
  await expect(page.getByText(/showcase/i)).toHaveCount(0);
  await page.reload();
  await expect(heading(page)).toHaveText("22 tickets are waiting.");
  expect(errors).toEqual([]);
});

for (const [pack, first] of [
  ["ev-charging", "40 tickets are waiting."],
  ["saas-support", "25 tickets are waiting."],
  ["e-commerce", "22 tickets are waiting."],
] as const) {
  test(`?pack=${pack} goes straight to that industry`, async ({ page }) => {
    await page.goto(`/?pack=${pack}`);
    await expect(heading(page)).toHaveText(first);
    await expect(page.getByRole("combobox", { name: "Industry" }).first()).toHaveValue(pack);
  });
}

test("an old desk link lands on the chooser, then opens that tab in the industry picked", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?desk=kb");
  await expect(heading(page)).toHaveText("Pick an industry");
  await expect(page.getByText("This link opens the desk. Pick an industry and it opens there.")).toBeVisible();
  await page.getByRole("button", { name: /^SaaS support/ }).click();
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Knowledge base", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveValue("saas-support");
  await expect(page).toHaveURL(/\?desk=kb&pack=saas-support(#.*)?$/);
  expect(errors).toEqual([]);
});

test("an unknown industry in a link lands on the chooser too", async ({ page }) => {
  await page.goto("/?pack=telecom&desk=queue");
  await expect(heading(page)).toHaveText("Pick an industry");
  await page.getByRole("button", { name: /^E-commerce/ }).click();
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Queue" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveValue("e-commerce");
  await expect(page).toHaveURL(/\?desk=queue&pack=e-commerce(#.*)?$/);
});

test("when an industry fails to load, the page says so and goes back to the chooser", async ({ page }) => {
  // The SaaS bundle is its own file, loaded when SaaS is picked; here the network refuses it.
  await page.route(/\/assets\/saas-desk-[^/]*\.js$/, (route) => route.abort());
  await page.goto("/?pack=saas-support&desk=queue");
  await expect(page.getByRole("alert")).toHaveText("This industry did not load. Reload the page to try again.");
  await page.getByRole("button", { name: "Back to the industries" }).click();
  await expect(heading(page)).toHaveText("Pick an industry");
  await expect(page.locator("#stage")).toBeFocused();
  // The address no longer names an industry or a desk tab, so a reload shows the chooser too.
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByText("This link opens the desk. Pick an industry and it opens there.")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the chooser passes axe (WCAG 2.2 AA) in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(heading(page)).toHaveText("Pick an industry");
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
}

test("the chooser has no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(heading(page)).toHaveText("Pick an industry");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Each industry's engineering notes describe its own lab: OCPP for EV, the token-storm delivery service for SaaS, the
// checkout service for e-commerce.
for (const { pack, kicker, own, others, lab } of [
  {
    pack: "ev-charging",
    kicker: "Engineering notes",
    own: ["The same problem on OCPP 1.6", "a scripted charger over a real websocket"],
    others: ["TokenStormReproductionTest", "SecondAuthorizationReproductionTest"],
    lab: "lab/README.md",
  },
  {
    pack: "saas-support",
    kicker: "Engineering notes · SaaS support",
    own: ["TokenStormReproductionTest", "a scripted identity provider", "One shared refresh"],
    others: ["OCPP", "charger", "SecondAuthorizationReproductionTest"],
    lab: "lab-saas/README.md",
  },
  {
    pack: "e-commerce",
    kicker: "Engineering notes · E-commerce",
    own: ["SecondAuthorizationReproductionTest", "a scripted payment processor", "One key per checkout"],
    others: ["OCPP", "charger", "TokenStormReproductionTest"],
    lab: "lab-ecommerce/README.md",
  },
]) {
  test(`the ${pack} engineering notes describe its own lab, and pass axe`, async ({ page }) => {
    await page.goto(`/?pack=${pack}`);
    await page
      .getByRole("navigation", { name: "Walkthrough and pages" })
      .getByRole("button", { name: "Engineering notes" })
      .click();
    await expect(heading(page)).toHaveText("How this was built, and what it does not prove");
    const article = page.locator("article.page");
    await expect(article.locator(".page-kicker")).toHaveText(kicker);
    for (const text of own) await expect(article).toContainText(text);
    for (const text of others) await expect(article).not.toContainText(text);
    await expect(article.getByRole("link", { name: "Lab README" })).toHaveAttribute("href", new RegExp(`/${lab}$`));
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
}

test("the SaaS and e-commerce operating model name their own monitor, not the charging network's NOC", async ({
  page,
}) => {
  for (const [pack, monitor] of [
    ["saas-support", "Status monitor sync"],
    ["e-commerce", "Site monitor sync"],
  ] as const) {
    await page.goto(`/?pack=${pack}`);
    await page
      .getByRole("navigation", { name: "Walkthrough and pages" })
      .getByRole("button", { name: "How I'd run it" })
      .click();
    const article = page.locator("article.page");
    await expect(article.getByRole("heading", { name: monitor })).toBeVisible();
    await expect(article).not.toContainText("NOC");
    await expect(article).not.toContainText("charger");
  }
});
