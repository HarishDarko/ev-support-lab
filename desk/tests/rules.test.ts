import { describe, it, expect } from "vitest";
import {
  ruleTriage,
  rulePatterns,
  ruleInvestigate,
  ruleHandoff,
  ruleVerify,
  ruleKb,
  ruleShiftnote,
  ruleClassify,
  RUNBOOK_IDS,
} from "../functions/_lib/rules";
import { METER_STEP, STEPS } from "../functions/_lib/steps";
import { TICKETS, HERO } from "../shared/synthetic";

describe("rules triage of the 40-ticket queue", () => {
  it("covers all 40 tickets", () => {
    expect(TICKETS).toHaveLength(40);
  });

  it("is stable: [id, component, action, runbook]", () => {
    const list = TICKETS.map((t) => {
      const r = ruleTriage(t);
      return [r.id, r.component, r.action, r.runbook];
    });
    expect(list).toMatchInlineSnapshot(`
      [
        [
          "T-2040",
          "connectivity",
          "close_with_runbook",
          "RB-03",
        ],
        [
          "T-2041",
          "session-state",
          "close_with_runbook",
          "RB-05",
        ],
        [
          "T-2042",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2043",
          "payments",
          "close_with_runbook",
          "RB-02",
        ],
        [
          "T-2044",
          "request-or-question",
          "needs_human",
          "none",
        ],
        [
          "T-2045",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2046",
          "connectivity",
          "close_with_runbook",
          "RB-03",
        ],
        [
          "T-2047",
          "session-state",
          "close_with_runbook",
          "RB-05",
        ],
        [
          "T-2048",
          "request-or-question",
          "needs_human",
          "none",
        ],
        [
          "T-2049",
          "payments",
          "close_with_runbook",
          "RB-02",
        ],
        [
          "T-2050",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2051",
          "host-portal",
          "close_with_runbook",
          "RB-04",
        ],
        [
          "T-2052",
          "hardware-field",
          "needs_human",
          "none",
        ],
        [
          "T-2053",
          "session-state",
          "close_with_runbook",
          "RB-05",
        ],
        [
          "T-2054",
          "platform-api",
          "info_only",
          "none",
        ],
        [
          "T-2055",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2056",
          "connectivity",
          "close_with_runbook",
          "RB-03",
        ],
        [
          "T-2057",
          "payments",
          "close_with_runbook",
          "RB-02",
        ],
        [
          "T-2058",
          "session-state",
          "close_with_runbook",
          "RB-05",
        ],
        [
          "T-2059",
          "pricing",
          "needs_human",
          "RB-07",
        ],
        [
          "T-2060",
          "request-or-question",
          "needs_human",
          "none",
        ],
        [
          "T-2061",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2062",
          "driver-app",
          "needs_human",
          "none",
        ],
        [
          "T-2063",
          "host-portal",
          "close_with_runbook",
          "RB-06",
        ],
        [
          "T-2064",
          "connectivity",
          "needs_human",
          "RB-03",
        ],
        [
          "T-2065",
          "driver-app",
          "needs_human",
          "none",
        ],
        [
          "T-2066",
          "session-state",
          "close_with_runbook",
          "RB-05",
        ],
        [
          "T-2067",
          "driver-app",
          "needs_human",
          "none",
        ],
        [
          "T-2068",
          "roaming",
          "needs_human",
          "none",
        ],
        [
          "T-2069",
          "authorization",
          "close_with_runbook",
          "RB-01",
        ],
        [
          "T-2070",
          "connectivity",
          "close_with_runbook",
          "RB-03",
        ],
        [
          "T-2071",
          "payments",
          "close_with_runbook",
          "RB-02",
        ],
        [
          "T-2072",
          "host-portal",
          "close_with_runbook",
          "RB-04",
        ],
        [
          "T-2073",
          "request-or-question",
          "needs_human",
          "none",
        ],
        [
          "T-2074",
          "request-or-question",
          "needs_human",
          "none",
        ],
        [
          "T-2075",
          "connectivity",
          "needs_human",
          "RB-03",
        ],
        [
          "T-2076",
          "host-portal",
          "close_with_runbook",
          "RB-04",
        ],
        [
          "T-2077",
          "host-portal",
          "close_with_runbook",
          "RB-04",
        ],
        [
          "T-2078",
          "payments",
          "close_with_runbook",
          "RB-02",
        ],
        [
          "T-2079",
          "connectivity",
          "close_with_runbook",
          "RB-03",
        ],
      ]
    `);
  });

  it("only ever names a real runbook or none", () => {
    for (const t of TICKETS) {
      const r = ruleTriage(t);
      expect(r.runbook === "none" || RUNBOOK_IDS.has(r.runbook)).toBe(true);
    }
  });

  it("always quotes words that are in the ticket", () => {
    for (const t of TICKETS) expect(t.text.toLowerCase()).toContain(ruleTriage(t).evidence.toLowerCase());
  });

  it("a closure outside the runbook's scope goes to a person with the reason recorded", () => {
    const r = ruleTriage({
      id: "X",
      text: "Session stuck Charging on CP-044-02, energy not flowing.",
      fw: "FW-C 1.6.2",
    });
    expect(r.action).toBe("needs_human");
    expect(r.reason).toMatch(/RB-05 doesn't apply \(firmware outside FW-A and FW-B/);
  });

  it("falls back to a person when no rule matches", () => {
    const r = ruleTriage({ id: "X", text: "Hello there" });
    expect([r.component, r.action, r.runbook, r.confidence]).toEqual([
      "request-or-question",
      "needs_human",
      "none",
      0.3,
    ]);
  });
});

describe("other rule fallbacks", () => {
  it("groups the stuck-session tickets and finds recurring history", () => {
    const stuck = rulePatterns().patterns.find((p) => p.name === "Stuck session");
    expect(stuck?.ticket_ids).toEqual(HERO.openIds);
    expect(stuck?.recurring).toBe(true);
  });

  it("investigation keeps both hypotheses unconfirmed", () => {
    const inv = ruleInvestigate();
    expect(inv.hypotheses.map((h) => h.status)).toEqual(["leading hypothesis", "alternative hypothesis"]);
    expect(inv.evidence[3]!.point).toContain("12 of 19");
  });

  it("handoff names the three rules that fired and keeps the firmware question unconfirmed", () => {
    const h = ruleHandoff();
    expect(h.rules_triggered).toEqual(["code", "spread", "billing"]);
    expect(h.hypothesis_note).toBe(
      "The backend ignoring a late Ended is reproduced in a lab with a simulated charger. Whether FW-B drops its queued Ended is not confirmed.",
    );
  });

  it("handoff reproduces with the lab test first, keeps one manual FW-B step, and describes the tests correctly", () => {
    const h = ruleHandoff();
    expect(h.reproduction[0]).toMatch(/lab's reproduction test.*flag off/);
    expect(h.reproduction.filter((step) => /FW-B/.test(step))).toHaveLength(1);
    expect(h.evidence_attached[0]).toBe("Lab tests: bug reproduced; regression fails without the fix");
    // The reproduction test passes while the bug exists; only the regression test fails without the fix.
    expect(h.reproduction.join(" ")).not.toMatch(/test fails/i);
  });

  it("verification says consistent with, not proof of", () => {
    const v = ruleVerify();
    expect(v.verdict).toBe("consistent with hypothesis");
    expect(v.reading).toContain("from 5 to 0");
    expect(v.what_it_does_not_prove.length).toBeGreaterThan(0);
  });

  it("the fallback article starts with the fixed meter step", () => {
    expect(ruleKb().steps[0]).toBe(METER_STEP);
  });

  it("shift note tolerates a missing summary", () => {
    const n = ruleShiftnote(undefined);
    expect(n.headline).toContain("Queue started at 40; 0 approved");
    expect(n.escalated).toEqual(["Nothing sent to engineering yet."]);
    expect(ruleShiftnote({ needs_a_person: ["1", "2", "3", "4", "5"] }).needs_you).toHaveLength(4);
  });

  it("classify returns the meter confirmation only for a known match", () => {
    expect(ruleClassify("Session open 7h, energy stopped climbing. Charging.", { title: "A" }).confirm).toMatch(
      /meter/,
    );
    expect(ruleClassify("Host asks about invoices").confirm).toBe("");
  });
});

describe("what a review asked for in the handover and the analysis prompts", () => {
  it("every rules handover item names an owner and a deadline", () => {
    const note = ruleShiftnote({ needs_a_person: ["T-2052: field service needed.", "T-2065: app crash."] });
    expect(note.needs_you).toHaveLength(2);
    for (const item of note.needs_you) expect(item).toMatch(/Owner: .+, by \d{2}:\d{2} ET\./);
  });

  it("the prompts ask for unlikely causes with reasons, a bar for widening, and owners with deadlines", () => {
    const investigate = STEPS.investigate.build();
    expect(investigate).toMatch(/unlikely, not impossible/);
    expect(STEPS.verify.build()).toMatch(/minimum observation period and a minimum number of drops/);
    expect(STEPS.shiftnote.build({ summary: {} })).toMatch(/an owner .* and a deadline in ET/);
    expect(STEPS.kb.build({ investigation: {}, handoff: {} })).toMatch(/say what to check before it/);
  });
});
