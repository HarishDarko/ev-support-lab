// The Scorecard says how uncertain 40 tickets are, and which answers in "this run" came from the rules.
import { test, expect } from "@playwright/test";
import { openFromChooser } from "./chooser";

test("the scorecard states the overlapping 95% ranges and the three rules fallbacks", async ({ page }) => {
  await openFromChooser(page, "/?desk=scorecard");
  const dialog = page.getByRole("dialog", { name: "The desk" });
  await expect(dialog.getByTestId("score-uncertainty")).toContainText("between 55% and 82%");
  await expect(dialog.getByTestId("score-uncertainty")).toContainText("between 45% and 74%");
  await expect(dialog.getByTestId("score-uncertainty")).toContainText(
    "The two ranges overlap, so 40 tickets cannot say whether the model or the rules triage better.",
  );
  await expect(dialog.getByText(/includes 3 tickets \(T-2041, T-2042, T-2061\)/)).toBeVisible();
  await expect(dialog.getByText(/the model scored here is also Claude/)).toBeVisible();
});
