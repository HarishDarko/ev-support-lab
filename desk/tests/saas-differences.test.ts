// F09 of the external review: the SaaS verification lists only the metrics the lab computed differently from the
// story, as the e-commerce and EV ones do. The lab emits every metric with a `matches` flag, so a refreshed copy of
// its output must not turn matching metrics into differences.
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/data/experiment.saas-support.json", async (importOriginal) => {
  const real: { default: Record<string, unknown> } = await importOriginal();
  return {
    default: {
      ...real.default,
      storyComparison: [
        { metric: "canary.after.storms", expected: 0, computed: 0, matches: true },
        { metric: "control.after.storms", expected: 9, computed: 8, matches: false },
        { metric: "canary.before.storms", expected: 9, computed: 9, matches: true },
      ],
    },
  };
});

const { SAAS_INCIDENT } = await import("../src/incident/saas-support");

describe("SaaS verification differences", () => {
  it("lists only the metrics that do not match", () => {
    expect(SAAS_INCIDENT.verification.differences).toEqual([
      { metric: "control.after.storms", expected: 9, computed: 8, matches: false },
    ]);
  });
});
