// SD-11, SD-13 and SD-15: the Industry choice. Three complete industries, each with its full incident walkthrough:
// EV charging, SaaS support and e-commerce.
import { test, expect, type Page } from "@playwright/test";
import { openFromChooser } from "./chooser";

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
  // Only a link that names EV charging goes straight to it; the others land on the choice of industries first.
  test(`${link} opens the EV desk with its own columns`, async ({ page }) => {
    const errors = watchErrors(page);
    if (link.includes("pack=ev-charging")) await page.goto(link);
    else await openFromChooser(page, link);
    const dialog = page.getByRole("dialog", { name: "The desk" });
    await expect(dialog).toBeVisible();
    const table = dialog.getByRole("table").first();
    await expect(table.getByRole("row")).toHaveCount(41);
    await expect(table.getByRole("columnheader", { name: "Site" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Firmware" })).toBeVisible();
    // The Industry menu lives in the top strip only: picking another industry from inside the desk hid the desk
    // without closing it.
    await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(menu(page)).toHaveValue("ev-charging");
    expect(errors).toEqual([]);
  });
}

test("the Industry menu offers the three complete industries, in the chooser's order", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("list").getByRole("button")).toHaveText([/^EV charging/, /^SaaS support/, /^E-commerce/]);
  await page.getByRole("button", { name: /^EV charging/ }).click();
  await expect(menu(page)).toHaveValue("ev-charging");
  await expect(menu(page).getByRole("option")).toHaveText(["EV charging", "SaaS support", "E-commerce"]);
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
});

test("picking SaaS support shows its own walkthrough, keeps the pick on reload, and switches back", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openFromChooser(page, "/");
  await menu(page).selectOption("saas-support");
  await expect(page).toHaveURL(/\?pack=saas-support(#.*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("25 tickets are waiting.");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("25 tickets are waiting.");
  await expect(menu(page)).toHaveValue("saas-support");

  await menu(page).selectOption("ev-charging");
  await expect(page).toHaveURL(/\?pack=ev-charging(#.*)?$/);
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
  // No Industry menu inside the desk (PR #5): the strip's menu names the industry once the desk is closed.
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveCount(0);
  await dialog.getByRole("tab", { name: "Scorecard" }).click();
  await expect(dialog.getByText(/reference-labels\.saas-support\.json/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu(page)).toHaveValue("saas-support");
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
  // No Industry menu inside the desk (PR #5): the strip's menu names the industry once the desk is closed.
  await expect(dialog.getByRole("combobox", { name: "Industry" })).toHaveCount(0);
  await dialog.getByRole("tab", { name: "Scorecard" }).click();
  await expect(dialog.getByText(/reference-labels\.e-commerce\.json/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu(page)).toHaveValue("e-commerce");
  expect(errors).toEqual([]);
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

test("switching industry after closing the desk keeps it closed", async ({ page }) => {
  const errors = watchErrors(page);
  await openFromChooser(page, "/?desk=queue");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await menu(page).selectOption("saas-support");
  await expect(page.getByRole("heading", { name: "25 tickets are waiting." })).toBeVisible();
  await menu(page).selectOption("ev-charging");
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(menu(page)).toHaveValue("ev-charging");
  expect(errors).toEqual([]);
});
