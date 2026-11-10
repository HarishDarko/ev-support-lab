// SD-11: the Industry choice. Only complete packs are offered, and today that is EV charging alone, so the menu
// stays hidden and every link, old or new, opens the EV desk.
import { test, expect, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

for (const link of [
  "/?desk=queue",
  "/?desk=queue&pack=ev-charging",
  "/?desk=queue&pack=nope",
  "/?desk=queue&pack=__proto__",
]) {
  test(`${link} opens the EV desk with its own columns and no Industry menu`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(link);
    const dialog = page.getByRole("dialog", { name: "The desk" });
    await expect(dialog).toBeVisible();
    const table = dialog.getByRole("table").first();
    await expect(table.getByRole("row")).toHaveCount(41);
    await expect(table.getByRole("columnheader", { name: "Site" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Firmware" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Industry" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("the walkthrough opens on the EV story whatever pack a link names", async ({ page }) => {
  await page.goto("/?pack=nope");
  await expect(page.getByText("40 tickets are waiting.").first()).toBeVisible();
  await expect(page.getByText("The incident walkthrough is the")).toHaveCount(0);
});
