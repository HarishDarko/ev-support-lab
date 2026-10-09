import { describe, it, expect } from "vitest";
import * as fromSrc from "../src/data/synthetic";
import * as fromShared from "../shared/synthetic";
import {
  TICKETS,
  HISTORY,
  HERO,
  RUNBOOKS,
  COMPONENTS,
  VERIFICATION,
  META,
  ENGINEERING_CHANGE,
} from "../shared/synthetic";
import { experiment } from "../src/data/experiment";

describe("synthetic data", () => {
  it("is labelled synthetic", () => {
    expect(META.label).toBe("Synthetic data · prototype");
  });

  it("has the expected shape", () => {
    expect(TICKETS).toHaveLength(40);
    expect(HISTORY).toHaveLength(30);
    expect(RUNBOOKS).toHaveLength(7);
    expect(COMPONENTS).toHaveLength(11);
    expect(HERO.openIds.length + HERO.historyIds.length).toBe(HERO.totalTickets);
    expect(HERO.unplugToDropSec).toHaveLength(HERO.totalTickets);
  });

  it("has unique ids that the hero incident can resolve", () => {
    const ids = [...TICKETS.map((t) => t.id), ...HISTORY.map((h) => h.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...HERO.openIds, ...HERO.historyIds]) expect(ids).toContain(id);
  });

  it("RB-05 is the record-only runbook", () => {
    expect(RUNBOOKS.filter((r) => r.recordOnly).map((r) => r.id)).toEqual(["RB-05"]);
  });

  it("src/data re-exports the shared module, so the browser and the functions read one copy", () => {
    expect(fromSrc.TICKETS).toBe(fromShared.TICKETS);
    expect(fromSrc.HERO).toBe(fromShared.HERO);
  });
});

describe("engineering change", () => {
  // It must describe the lab's transaction-aware fix (docs/specs/lab.md), not the older "close when Available" one.
  it.each([
    ["asks the charger", /GetTransactionStatus/],
    ["waits while messages are queued", /messages are queued/],
    ["keys events on the station, transactionId and seqNo", /station, transactionId and seqNo/],
    ["applies events in seqNo order", /in seqNo order/],
    ["closes provisionally only on an explicit not-ongoing report", /reports it is not ongoing with nothing queued/],
    ["sends rising energy, gaps and newer transactions to a person", /goes to a person/],
  ])("%s", (_name, pattern) => {
    expect(ENGINEERING_CHANGE.summary).toMatch(pattern);
  });

  it("makes no absolute safety claim", () => {
    expect(ENGINEERING_CHANGE.summary).not.toMatch(/\bnever\b/i);
  });
});

describe("experiment seam", () => {
  // The lab computes these from its own backend state. The story data must say the same thing.
  it("the lab's gateway excerpts are the story's logs, line for line", () => {
    expect(experiment.logs).toEqual(HERO.logs);
  });
  it("the lab's verification numbers are the story's numbers", () => {
    expect(experiment.verification).toEqual(VERIFICATION);
  });
  it("keeps the fleet view from the incident data", () => {
    expect(experiment.fleet).toBe(HERO.fleet);
  });
});
