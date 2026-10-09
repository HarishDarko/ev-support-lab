// The seam for the lab's measured results. experiment.json is the lab's own output, copied unchanged:
//   ./gradlew :lab:run --args="experiment --out build/experiment.json"
//   cp lab/build/experiment.json desk/src/data/experiment.json
// Every verification number and gateway excerpt the story shows comes from it. The 21-day fleet view and the
// unplug-to-drop timings describe the production incident before the lab existed, so they stay in synthetic.ts.
import lab from "./experiment.json";
import { HERO, VERIFICATION } from "./synthetic";
import type { FleetRow, HeroLog, LogLine, UnplugToDrop, Verification } from "./synthetic";

export interface Experiment {
  /** Synthetic OCPP 2.0.1 gateway excerpts, captured from the lab's real websocket traffic. */
  logs: HeroLog[];
  /** The 21-day fleet view by firmware line. */
  fleet: FleetRow[];
  /** Seconds from unplug to websocket drop, per stuck session. */
  unplugToDropSec: UnplugToDrop[];
  /** Canary and control results, and the correctness checks. */
  verification: Verification;
  /** Story values the lab computed differently from the original script, shown rather than hidden. */
  differences: { metric: string; expected: number; computed: number }[];
}

const before = lab.windows.before;
const after = lab.windows.after;
const days = 14;

export const experiment: Experiment = {
  logs: lab.gatewayLogs.map((l) => ({ title: l.title, lines: l.lines as LogLine[] })),
  fleet: HERO.fleet,
  unplugToDropSec: HERO.unplugToDropSec,
  verification: {
    windowDays: days,
    canary: {
      sites: after.canary.stations,
      before: { dropsNearUnplug: before.canary.dropsNearUnplug, stuck: before.canary.stuck },
      after: {
        dropsNearUnplug: after.canary.dropsNearUnplug,
        stuck: after.canary.stuck,
        closedByReconciliation: after.canary.reconciliations,
      },
    },
    control: {
      sites: after.control.stations,
      before: { dropsNearUnplug: before.control.dropsNearUnplug, stuck: before.control.stuck },
      after: { dropsNearUnplug: after.control.dropsNearUnplug, stuck: after.control.stuck },
    },
    // The detector is support's query, not part of the lab.
    detector: VERIFICATION.detector,
    complaintsBeforeDetector: VERIFICATION.complaintsBeforeDetector,
    correctness: {
      canarySessions: after.canary.sessions,
      reconciled: after.canary.reconciliations,
      falseClosures: after.canary.falseClosures,
      newerTransactionSkips: after.canary.newerTransactionSkips,
      lateEndedArrived: after.canary.lateEndedAppliedAfterProvisional,
      lateEndedApplied: after.canary.lateEndedAppliedAfterProvisional,
      duplicateCharges: after.canary.duplicateCharges,
      invoicesReviewed: after.canary.invoicesProvisionalIssued,
      invoicesAdjusted: after.canary.invoicesAdjusted,
    },
  },
  differences: lab.storyComparison.filter((c) => !c.matches),
};
