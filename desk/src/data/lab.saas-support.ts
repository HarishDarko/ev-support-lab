// What the SaaS walkthrough shows from its reproduction lab (lab-saas/), and where its source lives. The test classes
// and scenarios below are the lab's real ones (lab-saas/src/test/java/dev/saaslab/...); keep them in step with
// lab-saas/. CI runs them in .github/workflows/lab-saas.yml, including the regression test with the fix off.
import type { Lab } from "../incident/types";

const TESTS = "lab-saas/src/test/java/dev/saaslab/delivery";

export const SAAS_LAB: Lab = {
  reproduction: {
    className: "TokenStormReproductionTest",
    flag: "off",
    path: `${TESTS}/TokenStormReproductionTest.java`,
    cases: [["burst-at-expiry", "reproduces: endpoint paused while it is up"]],
  },
  regression: {
    className: "TokenStormRegressionTest",
    flag: "on",
    path: `${TESTS}/TokenStormRegressionTest.java`,
    cases: [["burst-at-expiry", "one token request, every event delivered once"]],
  },
  edgeCases: {
    className: "DeliveryEdgeCasesTest",
    flag: "on",
    path: `${TESTS}/DeliveryEdgeCasesTest.java`,
    cases: [
      ["quiet-expiry", "refreshed before expiry, no 401"],
      ["idp-rate-limited", "waits for Retry-After, not paused"],
      ["revoked-client", "still fails and counts"],
      ["endpoint-down", "a real outage still pauses"],
      ["hmac-endpoint", "no token requests"],
      ["secret-rotated", "still fails"],
    ],
  },
  /** The rules of the fix, as the lab's README states them. */
  rules: [
    {
      name: "One shared refresh",
      text: "One token refresh per endpoint. The other delivery threads wait for it and use its token.",
    },
    {
      name: "Refresh early",
      text: "5 minutes before expiry, minus a fixed per-endpoint jitter of up to 60 s, so it does not land on the hourly burst.",
    },
    { name: "Retry once", text: "After a 401, one retry after the shared refresh. No retry at once, in a loop." },
    {
      name: "Wait on a rate limit",
      text: "A 429 from the token endpoint makes deliveries wait for Retry-After. A revoked client and endpoint errors still count toward the pause.",
    },
  ],
  adrs: [],
  readme: "lab-saas/README.md",
  testTask: ":lab-saas:test",
  reproKicker: "Reproduction lab · Java 25 · webhooks and OAuth",
  fixKicker: "The change · behind a flag per workspace",
  reproShows: "shows the endpoint paused while it is up.",
};
