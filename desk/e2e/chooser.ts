// The site opens on a choice of the three industries. An address with no `?pack=` (an old link included) lands
// there, and a `?desk=` tab in it opens once an industry is picked. Specs that start from such an address pick one.
import { expect, type Page } from "@playwright/test";

export async function openFromChooser(page: Page, path: string, industry = "EV charging"): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pick an industry");
  await page.getByRole("button", { name: new RegExp(`^${industry}`) }).click();
}
