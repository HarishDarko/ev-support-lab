import { describe, it, expect } from "vitest";
import {
  STEPS,
  METER_STEP,
  BILLING_STEP,
  CONFIRM_METER,
  SOURCES,
  type KbModel,
  type TriageModelResult,
  type InvestigationModel,
  type PatternModel,
} from "../functions/_lib/steps";
import { HANDOFF_NOTE, LAB_TEST_ATTACHMENT } from "../functions/_lib/rules";
import { ValidationError } from "../functions/_lib/validate";
import { StepError } from "../functions/_lib/ai";
import { TICKETS, HERO } from "../shared/synthetic";

const ticket = (id: string) => TICKETS.find((t) => t.id === id)!;

describe("knowledge-base article: the fixed meter step", () => {
  const model = (steps: string[], related: string[] = []): KbModel => ({
    title: "t",
    applies_when: [],
    how_to_confirm: [],
    steps,
    escalate_if: [],
    status_note: "n",
    related,
  });

  it("is always step 1, added when the model left it out", () => {
    const out = STEPS.kb.validate(model(["Apply RB-05.", "Flag the invoice."]), {}, "p");
    expect(out.data.steps).toEqual([METER_STEP, "Apply RB-05.", "Flag the invoice.", BILLING_STEP]);
    expect(out.checks[0]).toMatchObject({ name: "Fixed meter check is step 1", passed: true, detail: "added" });
  });

  it("replaces any model step about confirming the meter, so a contradicting one cannot sit beside it", () => {
    const out = STEPS.kb.validate(
      model(["Check the meter is still climbing.", "Apply RB-05.", "Verify meter reading", "Confirm the customer."]),
      {},
      "p",
    );
    expect(out.data.steps).toEqual([METER_STEP, "Apply RB-05.", "Confirm the customer.", BILLING_STEP]);
    expect(out.checks[0]!.detail).toBe("2 model steps about the meter replaced");
  });

  it("always ends with the fixed billing-review step, replacing any model step about invoice review", () => {
    const out = STEPS.kb.validate(model(["Apply RB-05.", "Send the invoice for review."]), {}, "p");
    expect(out.data.steps).toEqual([METER_STEP, "Apply RB-05.", BILLING_STEP]);
    expect(out.checks[1]).toMatchObject({ name: "Fixed billing review is the last step", passed: true });
  });

  it("drops related ids that are not in the data", () => {
    const out = STEPS.kb.validate(
      model(["x"], ["T-2041", "T-9999", "RB-05", "ENG-4471", "INC-0412", "H-0000"]),
      {},
      "p",
    );
    expect(out.data.related).toEqual(["T-2041", "RB-05", "ENG-4471", "INC-0412"]);
  });

  it("rejects an article that cites an id that does not exist", () => {
    expect(() => STEPS.kb.validate(model(["See T-9999 for details."]), {}, "p")).toThrow(ValidationError);
  });

  it("the rules fallback article starts with the same step", () => {
    expect((STEPS.kb.fallback() as { steps: string[] }).steps[0]).toBe(METER_STEP);
  });

  it("a matched new ticket always carries the meter confirmation", () => {
    const out = STEPS.classify.validate(
      {
        component: "session-state",
        severity: "S2",
        matches_known_pattern: true,
        matched_article: "A",
        suggested_action: "x",
        escalate: false,
        why: "y",
      },
      { text: "Session open 7h, no energy change since unplug.", article: { title: "A" } },
    );
    expect(out.data.confirm).toBe(CONFIRM_METER);
  });
});

describe("triage validation", () => {
  const base = (id: string, over: Partial<TriageModelResult> = {}): TriageModelResult => ({
    id,
    summary: "s",
    component: "session-state",
    severity: "S2",
    action: "close_with_runbook",
    runbook: "RB-05",
    confidence: 0.8,
    reason: "r",
    evidence: "still showed 'Charging' hours after they unplugged",
    ...over,
  });
  const run = (r: TriageModelResult[], ids: string[]) => STEPS.triage.validate({ results: r }, { ids });

  it("rejects a send of no ids, unknown ids or more than ten with a 400", () => {
    for (const ids of [[], ["nope"], TICKETS.slice(0, 11).map((t) => t.id)]) {
      expect(() => STEPS.triage.build({ ids })).toThrow(StepError);
    }
    expect(() => STEPS.triage.build({})).toThrow(StepError);
  });

  it("keeps a verified AI result and marks support as strong", () => {
    const first = run([base("T-2041")], ["T-2041"]).data.results[0]!;
    expect(first).toMatchObject({
      source: "ai",
      quote_verified: true,
      support: "strong",
      action: "close_with_runbook",
    });
  });

  it("falls back to rules when the AI skipped a ticket", () => {
    const first = run([], ["T-2041"]).data.results[0] as { source: string; fallback_reason: string };
    expect(first).toMatchObject({ source: "rules", fallback_reason: "AI skipped this ticket" });
  });

  it("falls back to rules when the quote is not in the ticket", () => {
    const first = run([base("T-2041", { evidence: "this is invented text" })], ["T-2041"]).data.results[0] as {
      fallback_reason: string;
      rejected_quote: string;
    };
    expect(first.fallback_reason).toBe("AI quote not found in the ticket");
    expect(first.rejected_quote).toBe("this is invented text");
  });

  it("rejects a label whose words never appear in the ticket", () => {
    const out = run([base("T-2041", { component: "roaming", runbook: "none", action: "needs_human" })], ["T-2041"]);
    expect((out.data.results[0] as { fallback_reason: string }).fallback_reason).toMatch(/AI label "roaming"/);
  });

  it("rejects a runbook that does not fit the label or the ticket", () => {
    const wrongLabel = run([base("T-2041", { runbook: "RB-02" })], ["T-2041"]);
    expect((wrongLabel.data.results[0] as { fallback_reason: string }).fallback_reason).toBe(
      "Runbook RB-02 doesn't apply to session-state",
    );
    const wrongTicket = run(
      [
        base("T-2044", {
          component: "host-portal",
          runbook: "RB-04",
          evidence: "weekly utilization email instead of logging in to the portal",
        }),
      ],
      ["T-2044"],
    );
    expect((wrongTicket.data.results[0] as { fallback_reason: string }).fallback_reason).toBe(
      "Runbook RB-04 doesn't match what the ticket describes",
    );
  });

  it("blocks a closure when a runbook exception applies, and names the exception", () => {
    const t = ticket("T-2075");
    const out = run(
      [
        base(t.id, {
          component: "connectivity",
          runbook: "RB-03",
          evidence: "Soft reset sent by monitoring at 12:30, no response",
        }),
      ],
      [t.id],
    );
    const first = out.data.results[0] as { action: string; precondition: string };
    expect(first.action).toBe("needs_human");
    expect(first.precondition).toMatch(/RB-03 exception \(reset already tried\)/);
    expect(out.checks.find((c) => c.name === "Runbook exceptions")!.detail).toBe("1 closure blocked, sent to a person");
  });

  it("keeps a weak-support result but marks it", () => {
    const out = run([base("T-2041", { evidence: "Driver says the app" })], ["T-2041"]);
    expect(out.data.results[0]).toMatchObject({ source: "ai", support: "weak" });
    expect(out.checks.find((c) => c.name === "Quote names the label's subject")!.passed).toBe(false);
  });

  it("the fallback triages exactly the requested ids with the rules", () => {
    const res = STEPS.triage.fallback({ ids: ["T-2041", "T-2040"] }).results;
    expect(res.map((r) => [r.id, r.source, r.quote_verified])).toEqual([
      ["T-2041", "rules", false],
      ["T-2040", "rules", false],
    ]);
  });

  it("the prompt lists the requested tickets and the runbooks", () => {
    const p = STEPS.triage.build({ ids: ["T-2041"] });
    expect(p).toContain("T-2041 | opened Mon 10:03 ET | from Customer care | site S-014 (Parking garage · NJ)");
    expect(p).not.toContain("T-2040 |");
    expect(p).toContain("RB-05: Force-close a stuck session and reverse idle fees");
  });
});

describe("pattern validation", () => {
  const pat = (over: Partial<PatternModel>): PatternModel => ({
    name: "Stuck sessions",
    ticket_ids: ["T-2041", "T-2047"],
    history_ids: ["H-1903"],
    recurring: true,
    why_grouped: "w",
    next_step: "n",
    ...over,
  });

  it("removes unknown and duplicate ids and says so", () => {
    const out = STEPS.patterns.validate({
      patterns: [pat({ ticket_ids: ["T-2041", "T-2041", "T-2047", "T-0000"], history_ids: ["H-1903", "H-0"] })],
    });
    expect(out.data.patterns[0]).toMatchObject({ ticket_ids: ["T-2041", "T-2047"], history_ids: ["H-1903"] });
    expect(out.checks[0]).toMatchObject({ passed: false, detail: "3 unknown ids removed" });
  });

  it("drops catch-all groups and groups with fewer than two open tickets", () => {
    const out = STEPS.patterns.validate({
      patterns: [pat({}), pat({ name: "Misc one-offs" }), pat({ name: "Single", ticket_ids: ["T-2041"] })],
    });
    expect(out.data.patterns.map((p) => p.name)).toEqual(["Stuck sessions"]);
  });

  it("throws when nothing usable is left", () => {
    expect(() => STEPS.patterns.validate({ patterns: [pat({ name: "other" })] })).toThrow("No usable patterns");
  });

  it("puts earlier triage results into the prompt", () => {
    const p = STEPS.patterns.build({
      triage: [{ id: "T-2041", component: "session-state", severity: "S2", action: "x" }, null],
    });
    expect(p).toContain("| triage: session-state, S2, x");
  });
});

describe("investigation validation", () => {
  const inv = (evidence: InvestigationModel["evidence"]): InvestigationModel => ({
    symptom: "s",
    impact: [],
    evidence,
    hypotheses: [],
    ruled_out: [],
    open_questions: [],
  });
  const good = { point: "p", source: "Log CP-022-04", quote: "ignored: connector already Available (out of order)" };
  const good2 = { point: "p", source: "Log CP-014-02", quote: "(no TransactionEvent Ended received)" };

  it("knows the named sources", () => {
    expect(Object.keys(SOURCES)).toEqual([
      "Log CP-014-02",
      "Log CP-031-01",
      "Log CP-022-04",
      "Fleet view, 21 days",
      "Unplug-to-drop timings",
      "Tickets",
      "Support checks",
    ]);
  });

  it("keeps quotes found in the source they cite and drops the rest", () => {
    const out = STEPS.investigate.validate(inv([good, good2, { ...good, quote: "made up words here" }]), {}, "p");
    expect(out.data.evidence).toHaveLength(2);
    expect(out.data.evidence.every((e) => e.quote_verified)).toBe(true);
    expect(out.checks[0]).toMatchObject({ passed: false, detail: "2 of 3, the rest removed" });
  });

  it("checks the quote against the cited source only", () => {
    expect(() => STEPS.investigate.validate(inv([good, { ...good2, source: "Log CP-022-04" }]), {}, "p")).toThrow(
      "Only 1 of 2 evidence quotes found in the source they cite",
    );
  });

  it("flags numbers that are not in the prompt", () => {
    const out = STEPS.investigate.validate(
      { ...inv([good, good2]), symptom: "About 9999 sessions" },
      {},
      "prompt 14 tickets",
    );
    expect(out.checks.find((c) => c.name === "Numbers come from the input")).toMatchObject({ passed: false });
  });

  it("the prompt carries the hero data", () => {
    const p = STEPS.investigate.build();
    expect(p).toContain(HERO.name);
    expect(p).toContain("FW-B 4.2.x: 4812 sessions");
  });
});

describe("other steps", () => {
  it("handoff needs an ask and an escalation rule", () => {
    const h = {
      title: "t",
      severity: "S2",
      scope: "s",
      rules_triggered: ["code"],
      reproduction: [],
      evidence_attached: [],
      ruled_out: [],
      workaround_in_place: "w",
      the_ask: "Decide.",
      hypothesis_note: "h",
    };
    expect(STEPS.handoff.validate(h, {}, "p").checks[0]).toMatchObject({ passed: true, detail: "1 rules" });
    expect(() => STEPS.handoff.validate({ ...h, the_ask: "  " }, {}, "p")).toThrow(ValidationError);
    expect(() => STEPS.handoff.validate({ ...h, rules_triggered: [] }, {}, "p")).toThrow(ValidationError);
  });

  it("handoff always attaches the lab test and states the firmware question as not confirmed", () => {
    const out = STEPS.handoff.validate(
      {
        title: "t",
        severity: "S2",
        scope: "s",
        rules_triggered: ["code"],
        reproduction: [],
        evidence_attached: ["Fleet table"],
        ruled_out: [],
        workaround_in_place: "w",
        the_ask: "Decide.",
        hypothesis_note: "The cause is proven.",
      },
      {},
      "p",
    ).data as { hypothesis_note: string; evidence_attached: string[] };
    expect(out.hypothesis_note).toBe(HANDOFF_NOTE);
    expect(out.evidence_attached).toEqual([LAB_TEST_ATTACHMENT, "Fleet table"]);
  });

  it("the handoff prompt describes the lab test and keeps the firmware question open", () => {
    const p = STEPS.handoff.build({});
    expect(p).toContain("reproduction test");
    expect(p).toContain(LAB_TEST_ATTACHMENT);
    expect(p).toContain("passes by asserting the bug");
    expect(p).not.toMatch(/reproduction test, run with the fix flag off, fails/);
    expect(p).not.toMatch(/has not been reproduced/);
  });

  it("clip refuses oversized earlier output with a 400", () => {
    expect(() => STEPS.handoff.build({ investigation: "x".repeat(7000) })).toThrow("Input too large.");
  });

  it("classify needs 1 to 600 characters of ticket text", () => {
    for (const text of ["", "   ", "x".repeat(601), 5, undefined])
      expect(() => STEPS.classify.build({ text })).toThrow(StepError);
    expect(STEPS.classify.build({ text: "  hello " })).toContain('"""hello"""');
  });

  it("classify corrects a matched_article that is not the real title", () => {
    const out = STEPS.classify.validate(
      {
        component: "session-state",
        severity: "S2",
        matches_known_pattern: true,
        matched_article: "Invented",
        suggested_action: "x",
        escalate: false,
        why: "y",
      },
      { text: "Session open 7h.", article: { title: "Real" } },
    );
    expect(out.data.matched_article).toBe("Real");
    expect(out.checks[0]).toMatchObject({ name: "Matched article exists", passed: false });
  });

  it("every step has a schema, a fallback and a deadline class", () => {
    for (const [name, step] of Object.entries(STEPS)) {
      expect(step.schema, name).toMatchObject({ type: "object", additionalProperties: false });
      expect(typeof step.fallback, name).toBe("function");
    }
    expect(
      Object.entries(STEPS)
        .filter(([, s]) => !s.deep)
        .map(([n]) => n),
    ).toEqual(["triage", "classify"]);
  });
});
