// What the e-commerce walkthrough shows from its reproduction lab (lab-ecommerce/), and where its source lives. The
// test classes and scenarios below are the lab's real ones (lab-ecommerce/src/test/java/dev/shoplab/...); keep them
// in step with lab-ecommerce/. CI runs them in .github/workflows/lab-ecommerce.yml, including the regression test
// with the fix off.
import type { Lab } from "../incident/types";

const TESTS = "lab-ecommerce/src/test/java/dev/shoplab/checkout";

export const SHOP_LAB: Lab = {
  reproduction: {
    className: "SecondAuthorizationReproductionTest",
    flag: "off",
    path: `${TESTS}/SecondAuthorizationReproductionTest.java`,
    cases: [
      ["slow-web-repay", "reproduces: two keys, two authorizations, order held"],
      ["slow-app-retry", "reproduces: the app's retry, order held"],
      ["app-race", "reproduces: both authorizations captured"],
    ],
  },
  regression: {
    className: "SecondAuthorizationRegressionTest",
    flag: "on",
    path: `${TESTS}/SecondAuthorizationRegressionTest.java`,
    cases: [
      ["slow-web-repay", "one key, one authorization, order confirmed"],
      ["slow-app-retry", "one key, one authorization, order confirmed"],
      ["app-race", "one capture, order confirmed"],
    ],
  },
  edgeCases: {
    className: "CheckoutEdgeCasesTest",
    flag: "on",
    path: `${TESTS}/CheckoutEdgeCasesTest.java`,
    cases: [
      ["fast-pay", "no retry, no lookup"],
      ["slow-web-wait", "told it is still processing, confirms"],
      ["decline-new-card", "a new key, one authorization"],
      ["very-slow", "looked up by key, the second tap returns the first"],
      ["capture-webhook-timeout", "still held"],
      ["RB-21", "releases one capture, refuses two"],
    ],
  },
  /** The rules of the fix, as the lab's README states them. */
  rules: [
    {
      name: "One key per checkout",
      text: "The idempotency key is made once per checkout and reused on every retry, so a retry returns the first authorization.",
    },
    { name: "A new key only for a new payment", text: "Only a new card or a new amount makes a new key." },
    {
      name: "Look it up before an error",
      text: "On a timeout, checkout asks the processor for the payment by its key and says it is still processing.",
    },
    {
      name: "One capture per order",
      text: "The order service captures under a per-order lock, so two authorizations can never both be captured.",
    },
  ],
  adrs: [],
  readme: "lab-ecommerce/README.md",
  testTask: ":lab-ecommerce:test",
  reproKicker: "Reproduction lab · Java 25 · checkout and payments",
  fixKicker: "The change · behind a flag per store",
  reproShows: "shows the order held in Payment pending with two authorizations.",
};
