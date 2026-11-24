// The production build carries the Cloudflare Web Analytics beacon. Its script and its report go to Cloudflare, not to
// the local test server, and a failed report would show up as a console error in the tests that watch for them.
// Every browser test answers those two requests with an empty script instead, so nothing leaves the machine and the
// beacon never runs. (PostHog needs no stub here: the tests run with Do Not Track on and a build with no key.)
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(/^https:\/\/(static\.)?cloudflareinsights\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
    );
    await use(context);
  },
});

export { expect };
