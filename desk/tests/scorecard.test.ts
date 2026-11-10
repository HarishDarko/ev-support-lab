// The Scorecard's numbers: triage scored against the reviewed reference labels, and the rules' held-out check.
import { describe, it, expect } from "vitest";
import { COMPONENTS, TICKETS } from "../src/data/synthetic";
import { RUNBOOK_IDS } from "../functions/_lib/rules";
import { recordedRun } from "../src/run/recorded";
import {
  LABELS_REVIEWED,
  REFERENCE_LABELS,
  SCORE_FIELDS,
  historyCheck,
  rulesAnswers,
  scoreTriage,
  triageAnswers,
  type ReferenceLabel,
  type TriageAnswer,
} from "../src/run/score";

const label = (id: string, over: Partial<ReferenceLabel> = {}): ReferenceLabel => ({
  id,
  component: ["payments"],
  severity: ["S2", "S3"],
  action: ["close_with_runbook"],
  runbook: ["RB-02"],
  why: "",
  ...over,
});
const answer = (id: string, over: Partial<TriageAnswer> = {}): TriageAnswer => ({
  id,
  component: "payments",
  severity: "S2",
  action: "close_with_runbook",
  runbook: "RB-02",
  ...over,
});

describe("scoreTriage", () => {
  it("scores each field on its own, and all four only when every field is right", () => {
    const labels = [label("T-1"), label("T-2")];
    const answers = [answer("T-1"), answer("T-2", { runbook: "none" })];
    expect(scoreTriage(labels, answers)).toEqual({
      n: 2,
      fields: { component: 2, severity: 2, action: 2, runbook: 1 },
      allFour: 1,
    });
  });

  it("lenient accepts any listed answer; strict accepts only the first", () => {
    const labels = [label("T-1")];
    const answers = [answer("T-1", { severity: "S3" })];
    expect(scoreTriage(labels, answers, "lenient").fields.severity).toBe(1);
    expect(scoreTriage(labels, answers, "strict").fields.severity).toBe(0);
    expect(scoreTriage(labels, answers, "strict").allFour).toBe(0);
  });

  it("counts only tickets that have both a label and an answer", () => {
    const labels = [label("T-1"), label("T-2")];
    expect(scoreTriage(labels, [answer("T-2"), answer("T-9")]).n).toBe(1);
    expect(scoreTriage(labels, []).n).toBe(0);
  });
});

describe("the reviewed reference labels", () => {
  it("cover the 40 tickets exactly once, in queue order", () => {
    expect(REFERENCE_LABELS.map((l) => l.id)).toEqual(TICKETS.map((t) => t.id));
  });

  it("use only answers the triage step can give, with at least one per field", () => {
    const allowed: Record<(typeof SCORE_FIELDS)[number], readonly string[]> = {
      component: COMPONENTS,
      severity: ["S1", "S2", "S3", "S4"],
      action: ["close_with_runbook", "needs_human", "escalation_candidate", "info_only"],
      runbook: [...RUNBOOK_IDS, "none"],
    };
    for (const l of REFERENCE_LABELS) {
      for (const f of SCORE_FIELDS) {
        expect(l[f].length, `${l.id} ${f}`).toBeGreaterThan(0);
        for (const v of l[f]) expect(allowed[f], `${l.id} ${f}`).toContain(v);
      }
      if (l.action[0] === "close_with_runbook") expect(l.runbook[0], l.id).not.toBe("none");
    }
  });

  it("carry the review date", () => {
    expect(LABELS_REVIEWED).toBe("2026-11-09");
  });
});

describe("the scorecard numbers for the committed recorded run", () => {
  const run = triageAnswers(recordedRun());
  const rules = rulesAnswers();

  it("reads one answer per ticket from the recorded run and from the rules", () => {
    expect(run).toHaveLength(40);
    expect(rules).toHaveLength(40);
  });

  it("recorded run, lenient: 28 of 40 fully right", () => {
    expect(scoreTriage(REFERENCE_LABELS, run)).toEqual({
      n: 40,
      fields: { component: 37, severity: 35, action: 33, runbook: 38 },
      allFour: 28,
    });
  });

  it("keyword rules, lenient: 24 of 40 fully right", () => {
    expect(scoreTriage(REFERENCE_LABELS, rules)).toEqual({
      n: 40,
      fields: { component: 38, severity: 29, action: 35, runbook: 39 },
      allFour: 24,
    });
  });

  it("strict (first answer only): 23 of 40 each", () => {
    expect(scoreTriage(REFERENCE_LABELS, run, "strict").allFour).toBe(23);
    expect(scoreTriage(REFERENCE_LABELS, rules, "strict").allFour).toBe(23);
  });

  it("the rules pick the real resolution's runbook on 21 of 30 older closed tickets", () => {
    expect(historyCheck()).toEqual({ same: 21, n: 30 });
  });
});
