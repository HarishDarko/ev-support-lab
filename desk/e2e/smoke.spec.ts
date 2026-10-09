import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Collects anything that would show up as an error in the browser console. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => errors.push(`requestfailed: ${req.url()}`));
  return errors;
}

test("loads, shows the synthetic label, toggles the theme, no console errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");

  await expect(page).toHaveTitle("Support Desk");
  await expect(page.getByTestId("synthetic-label")).toContainText("Synthetic data");
  await expect(page.getByRole("navigation", { name: "Walkthrough and pages" }).getByRole("button")).toHaveCount(7);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("40 tickets are waiting.");

  // Theme: starts from the system setting (light under Playwright), then flips and persists.
  const html = page.locator("html");
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", "light");

  // Arrow keys move one beat; the stage nav jumps to a stage.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The first 90 minutes overlap with India engineering.",
  );
  const nav = page.getByRole("navigation", { name: "Walkthrough and pages" });
  await nav.getByRole("button", { name: /Triage/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every ticket read. Every decision quoted.");
  await expect(nav.getByRole("button", { name: /Triage/ })).toHaveAttribute("aria-current", "step");

  expect(errors).toEqual([]);
});

test("the Pages Function answers from the rules under MOCK=1", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ live: false });

  const res = await request.post("/api/triage", { data: { ids: ["T-2041"] } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: { results: { id: string; runbook: string; source: string }[] };
    trace: { source: string; fallbackReason: string; cost: number };
  };
  expect(body.data.results[0]).toMatchObject({ id: "T-2041", runbook: "RB-05", source: "rules" });
  expect(body.trace).toMatchObject({
    source: "rules",
    fallbackReason: "AI is turned off in this environment.",
    cost: 0,
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`no accessibility violations (WCAG 2.2 AA), ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("no horizontal scroll at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "40 tickets are waiting." })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the two reading pages open from the top strip, pass axe, and the stage nav returns to the walkthrough", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Walkthrough and pages" });

  for (const [name, heading] of [
    ["How I'd run it", "Eastern-hours dev support, day to day"],
    ["Engineering notes", "How this was built, and what it does not prove"],
  ] as const) {
    await nav.getByRole("button", { name }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(nav.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Walkthrough", exact: true })).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations, name).toEqual([]);
  }

  await nav.getByRole("button", { name: /Evidence/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One pattern, one incident: INC-0412.");
  expect(errors).toEqual([]);
});

test("the theme button is an icon with a stable name and a pressed state", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Dark mode" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText("");
  await expect(toggle.locator("svg")).toHaveCount(1);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute("title", "Switch to light mode");
});
