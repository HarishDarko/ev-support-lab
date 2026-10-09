// The reviewer's attacks from the nine adversarial rounds, replayed offline against the validators and rules.
// Ported one for one from the prototype's attacks script (73 cases), plus the "closure on every ticket" guard.
import { describe, it, expect } from "vitest";
import { STEPS, type TriageModelResult, type ClassifyModel } from "../functions/_lib/steps";
import { ruleClassify, ruleTriage } from "../functions/_lib/rules";
import { TICKETS, NEW_TICKET_EXAMPLE } from "../shared/synthetic";

const t = (id: string) => {
  const ticket = TICKETS.find((x) => x.id === id);
  if (!ticket) throw new Error(`no ticket ${id}`);
  return ticket;
};
const firstWords = (id: string, n = 6) => t(id).text.split(" ").slice(0, n).join(" ");
const triage = (r: TriageModelResult) => STEPS.triage.validate({ results: [r] }, { ids: [r.id] });
const model = (r: Partial<TriageModelResult> & Pick<TriageModelResult, "id" | "evidence">): TriageModelResult => ({
  summary: "x",
  component: "session-state",
  severity: "S2",
  action: "close_with_runbook",
  runbook: "RB-05",
  confidence: 0.9,
  reason: "x",
  ...r,
});

const article = { title: "Session stuck in Charging after the charger reconnects" };
const cls = (text: string, over: Partial<ClassifyModel> = {}) =>
  STEPS.classify.validate(
    {
      component: "session-state",
      severity: "S2",
      matches_known_pattern: true,
      matched_article: article.title,
      suggested_action: "Apply RB-05",
      escalate: false,
      why: "x",
      ...over,
    },
    { text, article },
  );

describe("1. closure with runbook none", () => {
  const out = triage(model({ id: "T-2041", runbook: "none", evidence: firstWords("T-2041") }));
  const first = out.data.results[0]!;

  it("close + runbook none -> rules", () => {
    expect(first.source).toBe("rules");
    expect((first as { fallback_reason: string }).fallback_reason).toMatch(/no runbook/);
  });
  it("close + none -> check fails", () => {
    expect(out.checks.some((c) => c.name === "Every closure names a runbook" && !c.passed)).toBe(true);
  });
  it("rules result still has a runbook", () => {
    expect(first.runbook !== "none" || first.action !== "close_with_runbook").toBe(true);
  });
});

describe("2. valid RB-05 closure on a hero ticket", () => {
  it("is kept as an AI result", () => {
    const first = triage(model({ id: "T-2041", evidence: firstWords("T-2041") })).data.results[0]!;
    expect(first.source).toBe("ai");
    expect(first.action).toBe("close_with_runbook");
  });
});

describe("3. classify: FW-C, negation, real exception", () => {
  it("FW-C ticket escalated (AI path)", () => {
    const c = cls("Session on CP-044-02 (FW-C 1.6.2) still shows Charging 3h after unplug, energy flat.");
    expect(c.data.escalate && !c.data.matches_known_pattern).toBe(true);
  });
  it("'No energy flowing' not escalated (AI path)", () => {
    const c = cls(
      "No energy flowing after unplug, session still shows Charging. Connection dropped and came back 30 s after unplug.",
    );
    expect(!c.data.escalate && c.data.matches_known_pattern).toBe(true);
  });
  it("'energy still climbing' escalated (AI path)", () => {
    expect(
      cls("Session shows Charging but energy still climbing at 4 kW, driver says car is plugged in.").data.escalate,
    ).toBe(true);
  });
  it("'energy is not flowing' not escalated", () => {
    expect(cls("Energy is not flowing, session open 5h after unplug.").data.escalate).toBe(false);
  });
  it("'energy stopped climbing' not escalated", () => {
    expect(cls("Session open 5h, energy stopped climbing at 22:10.").data.escalate).toBe(false);
  });
  it("'never dropped' escalated", () => {
    expect(cls("Session stuck Charging; the charger never dropped its connection.").data.escalate).toBe(true);
  });
  it("check name lists the exceptions", () => {
    const c = cls("Session stuck Charging; the charger never dropped its connection.");
    const named = c.checks.find((k) => k.name.startsWith("Pattern exceptions checked by wording"));
    expect(named?.name).toMatch(/firmware outside FW-A and FW-B/);
  });

  it("FW-C ticket escalated (rules)", () => {
    const r = ruleClassify(
      "Session on CP-044-02 (FW-C 1.6.2) still shows Charging 3h after unplug, energy flat.",
      article,
    );
    expect(r.escalate && !r.matches_known_pattern).toBe(true);
  });
  it("'No energy flowing' known (rules)", () => {
    const r = ruleClassify(
      "No energy flowing after unplug, session still shows Charging. Connection dropped and came back.",
      article,
    );
    expect(!r.escalate && r.matches_known_pattern).toBe(true);
  });
  it("FW-C offline ticket not called out-of-pattern", () => {
    expect(ruleClassify("CP-044-01 (FW-C 1.6.2) no heartbeat since 08:47.", article).escalate).toBe(false);
  });
});

describe("4. the default new-ticket example still matches", () => {
  it("matches the article (rules)", () => {
    const r = ruleClassify(NEW_TICKET_EXAMPLE, article);
    expect(r.matches_known_pattern && !r.escalate).toBe(true);
  });
  it("matches the article (AI path)", () => {
    const c = cls(NEW_TICKET_EXAMPLE);
    expect(c.data.matches_known_pattern && !c.data.escalate).toBe(true);
  });
});

describe("5. rules triage across the queue", () => {
  it("no ticket becomes a closure without a runbook", () => {
    const bad = TICKETS.map(ruleTriage).filter((x) => x.action === "close_with_runbook" && x.runbook === "none");
    expect(bad).toEqual([]);
  });
  it("hero tickets are still RB-05 closures", () => {
    const heroes = ["T-2041", "T-2047", "T-2053", "T-2058", "T-2066"].map((id) => ruleTriage(t(id)));
    expect(heroes.every((x) => x.runbook === "RB-05" && x.action === "close_with_runbook")).toBe(true);
  });
  it("reset-tried tickets need a person", () => {
    const reset = ["T-2075", "T-2064"].map((id) => ruleTriage(t(id)));
    expect(reset.every((x) => x.action === "needs_human")).toBe(true);
  });
});

describe("6. old attacks still caught", () => {
  it("wrong runbook -> rules", () => {
    const out = triage(
      model({
        id: "T-2043",
        component: "payments",
        severity: "S4",
        runbook: "RB-01",
        evidence: "$50 pending hold",
      }),
    );
    expect(out.data.results[0]!.source).toBe("rules");
  });
});

describe("7. a later positive energy phrase behind an earlier negated one; negation across clauses", () => {
  const texts = [
    "No energy flowing earlier. Energy still climbing now. The session is stuck open after a connection drop near unplug on FW-B.",
    "No faults; energy still climbing, session shows Charging.",
    "No faults reported, energy still climbing and the session shows Charging.",
  ];
  it.each(texts)("AI path escalates: %s", (text) => {
    const a = cls(text);
    expect(a.data.escalate && !a.data.matches_known_pattern).toBe(true);
  });
  it.each(texts)("rules escalate: %s", (text) => {
    const b = ruleClassify(text, article);
    expect(b.escalate && !b.matches_known_pattern).toBe(true);
  });
  it("rules: 'energy is not flowing' labelled session-state", () => {
    const r = ruleTriage({ id: "X", text: "Energy is not flowing, session open 5h after unplug.", fw: "FW-B 4.2.1" });
    expect(r.component).toBe("session-state");
  });
});

// Compound sentences and unrelated negations must escalate; plain negations must not.
const tail = " Session shows Charging after unplug on FW-B.";
export const MUST_ESCALATE = [
  "Energy and power are still flowing.",
  "Energy is not rising but is still flowing.",
  "Energy is flat and then starts climbing.",
  "No errors reported despite energy still climbing.",
  "Energy has stopped and is now climbing again.",
  "Charger still delivering 7 kW.",
  "No faults, power still flowing.",
  "Meter is going up.",
  "kWh keeps increasing.",
  "Not sure why, but energy is rising.",
  "Never seen this before: energy climbing.",
  "Energy not rising, but power still drawing 3 kW.",
  "Charger still delivering 7.2 kW.",
  "Charger is still drawing 3.5 kW.",
  "Energy has not stopped flowing.",
  "Energy hasn't stopped flowing.",
  "The meter has never stopped increasing.",
  "Energy continues to rise.",
  "Meter went from 12.4 to 12.7 kWh in ten minutes.",
  "Power keeps ramping up.",
  "Energy rose by 2 kWh overnight.",
  "kWh climbs every few minutes.",
  "Charger is drawing 7kW.",
  "Meter has advanced by 0.3 kWh since unplug.",
  "Energy is still being delivered.",
  "Energy was flat. It is now increasing.",
  "Power has not completely stopped flowing.",
];
export const MUST_NOT = [
  "No energy flowing.",
  "Energy is not flowing.",
  "Energy stopped climbing after 40 min.",
  "Energy hasn't been rising since 22:10.",
  "No energy flowing or climbing.",
  "Energy is neither rising nor climbing.",
  "No energy change since 22:10.",
  "Energy flat, not climbing.",
  "No energy is currently flowing.",
  "Energy hasn't been steadily rising since 22:10.",
  "Energy is flat and the idle fee is increasing.",
  "Meter stuck at 12.4 kWh since 22:10.",
  "Energy stopped flowing at 22:10.",
  "Energy stopped climbing after about 40 min.",
  "Idle fee keeps rising while energy is flat at 18.3 kWh.",
  "No energy or kWh is increasing.",
  "Energy is flat, idle fee keeps on rising.",
  "Meter did not go from 12.4 to 12.7 kWh; it stayed at 12.4.",
  "Session delivered 18 kWh, then stopped.",
  "Meter hasn't advanced since 22:10.",
];

describe("8. the energy-negation set", () => {
  it("has the expected number of cases", () => {
    expect(MUST_ESCALATE).toHaveLength(27);
    expect(MUST_NOT).toHaveLength(20);
  });
  it.each(MUST_ESCALATE)("escalates on both paths: %s", (x) => {
    const a = cls(x + tail);
    const b = ruleClassify(x + tail, article);
    expect(a.data.escalate && !a.data.matches_known_pattern && b.escalate, JSON.stringify([a.data.why, b.why])).toBe(
      true,
    );
  });
  it.each(MUST_NOT)("no escalation on either path: %s", (x) => {
    const a = cls(x + tail);
    const b = ruleClassify(x + tail, article);
    expect(!a.data.escalate && !b.escalate, JSON.stringify([a.data.why, b.why])).toBe(true);
  });
});
