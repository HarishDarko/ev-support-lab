// The production build carries the Cloudflare Web Analytics beacon, and a build with a key also loads PostHog.
// None of that may leave the machine or run in a test, so every browser test:
//   - reports Do Not Track (Chromium has no switch for it, so navigator.doNotTrack is set before the page loads),
//     which keeps PostHog from starting at all, and
//   - answers any request to Cloudflare Web Analytics or PostHog (us and eu, ingestion and assets) with an empty 200,
//     so a failed report cannot show up as a console error in the tests that watch for them.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" });
    });
    await context.route(/^https:\/\/(static\.)?cloudflareinsights\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
    );
    await context.route(/^https:\/\/(us|eu)(-assets)?\.i\.posthog\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
    );
    await use(context);
  },
});

export { expect };
