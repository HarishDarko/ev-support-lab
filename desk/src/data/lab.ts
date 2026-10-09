// What the story shows from the reproduction lab (lab/), and where its source lives. The test classes and
// scenarios below are the lab's real ones (lab/src/test/java/dev/evlab/...); keep them in step with lab/.

export const REPO = "https://github.com/HarishDarko/ev-support-lab";
export const source = (path: string) => `${REPO}/blob/main/${path}`;

const TESTS = "lab/src/test/java/dev/evlab/transaction";

export interface TestRun {
  className: string;
  flag: "on" | "off";
  path: string;
  /** [scenario, what the test asserts]. */
  cases: readonly (readonly [string, string])[];
}

const reproduction: TestRun = {
  className: "StuckSessionReproductionTest",
  flag: "off",
  path: `${TESTS}/StuckSessionReproductionTest.java`,
  cases: [
    ["late-ended", "reproduces: session stays open"],
    ["lost-ended", "reproduces: session stays open"],
  ],
};

const regression: TestRun = {
  className: "StuckSessionRegressionTest",
  flag: "on",
  path: `${TESTS}/StuckSessionRegressionTest.java`,
  cases: [
    ["late-ended", "closed by the real Ended, confirmed"],
    ["lost-ended", "closed at last meter, provisional"],
  ],
};

const edgeCases: TestRun = {
  className: "ReconciliationEdgeCasesTest",
  flag: "on",
  path: `${TESTS}/ReconciliationEdgeCasesTest.java`,
  cases: [
    ["still-delivering", "left open, flagged for a person"],
    ["newer-transaction", "old session skipped, flagged"],
    ["duplicate-ended", "applied once, charged once"],
    ["queued-messages", "waits, then the Ended closes it"],
    ["very-late-ended", "adjusts once, no second charge"],
    ["out-of-order", "applied in sequence, not arrival order"],
  ],
};

export const LAB = {
  reproduction,
  regression,
  edgeCases,
  /** The four rules of the fix, as the decision records state them. */
  rules: [
    {
      name: "Ask before closing",
      text: "On reconnect, send GetTransactionStatus. While messages are queued or the charger says ongoing, keep it open.",
    },
    {
      name: "Apply a late Ended once",
      text: "Key every event on the station, transactionId and seqNo. A duplicate is acknowledged and ignored.",
    },
    {
      name: "Close provisionally only on a clear answer",
      text: 'Only on "not ongoing, nothing queued", with the Started received and no seqNo gaps. Provisional: that answer can also mean the charger no longer knows the transaction.',
    },
    {
      name: "Anything unclear goes to a person",
      text: "Rising energy, a stale or too-close meter, a sequence gap, or a newer transaction on the EVSE.",
    },
  ],
  adrs: [
    { title: "Transaction-aware reconciliation", path: "docs/adr/0001-transaction-aware-reconciliation.md" },
    {
      title: "Idempotency by station, transactionId and seqNo",
      path: "docs/adr/0002-idempotency-by-transaction-id-and-seq-no.md",
    },
    {
      title: "Provisional billing and late-Ended adjustment",
      path: "docs/adr/0003-provisional-billing-and-late-ended-adjustment.md",
    },
  ],
  readme: "lab/README.md",
  /** The experiment's control group by firmware (lab/src/main/resources/experiment/inputs.json). */
  controlMix: "4 FW-B, 2 FW-A",
  /** A related reconnect problem fixed in public in an open-source OCPP backend (not the identical mechanism). */
  precedent: { title: "CitrineOS #1053", url: "https://github.com/citrineos/citrineos-core/pull/1053" },
  policy: "lab/src/main/java/dev/evlab/reconciliation/ReconciliationPolicy.java",
};
