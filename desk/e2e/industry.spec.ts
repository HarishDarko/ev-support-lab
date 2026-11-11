// SD-11, SD-13 and SD-15: the Industry choice. Three complete industries, each with its full incident walkthrough:
// EV charging, SaaS support and e-commerce.
import { test, expect, type Page } from "@playwright/test";

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

test("picking SaaS support shows its own walkthrough, keeps the pick on reload, and switches back", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await menu(page).selectOption("saas-support");
  await expect(page).toHaveURL(/\?pack=saas-support(#.*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("25 tickets are waiting.");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("25 tickets are waiting.");
  await expect(menu(page)).toHaveValue("saas-support");

  await menu(page).selectOption("ev-charging");
  await expect(page).not.toHaveURL(/pack=/);
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a SaaS desk link opens the SaaS desk with its own columns and scorecard", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?desk=queue&pack=saas-support");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  const table = dialog.getByRole("table").first();
  await expect(table.getByRole("row")).toHaveCount(26);
  await expect(table.getByRole("columnheader", { name: "Account" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Plan" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveValue("saas-support");
  await dialog.getByRole("tab", { name: "Scorecard" }).click();
  await expect(dialog.getByText(/reference-labels\.saas-support\.json/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("an e-commerce desk link opens the e-commerce desk with its own columns and scorecard", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?desk=queue&pack=e-commerce");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  const table = dialog.getByRole("table").first();
  await expect(table.getByRole("row")).toHaveCount(23);
  await expect(table.getByRole("columnheader", { name: "Order" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Channel" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveValue("e-commerce");
  await dialog.getByRole("tab", { name: "Scorecard" }).click();
  await expect(dialog.getByText(/reference-labels\.e-commerce\.json/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("the e-commerce walkthrough has no sideways scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?pack=e-commerce");
  await expect(page.getByText("22 tickets are waiting.").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an e-commerce desk link does not reopen the desk after switching to EV charging", async ({ page }) => {
  await page.goto("/?desk=queue&pack=e-commerce");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("22 tickets are waiting.");
  await menu(page).selectOption("ev-charging");
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
