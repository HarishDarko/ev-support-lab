// The Run model: the recorded file, lanes and the repeat rule, provenance, and merging live answers.
// No network: the live runner is given a fake PostStep.
import { describe, it, expect } from "vitest";
import { HISTORY, NEW_TICKET_EXAMPLE, TICKETS } from "../src/data/synthetic";
import { recordedRun } from "../src/run/recorded";
import { parseRecordedRun, runFromRecording } from "../src/run/parse";
import { CHECK_SCOPE, costText, provenanceOf } from "../src/run/provenance";
import {
  LANE_LABEL,
  REPEAT_LIMIT,
  WINDOW_DAYS,
  laneOf,
  needsMeterCheck,
  priorUses,
  repeatRuleFor,
  repeatRuleHolds,
} from "../src/run/guardrail";
import { indexRun, laneCounts, lanesOf, originCounts, shiftSummary } from "../src/run/selectors";
import {
  CHAIN_CALLS,
  TRIAGE_BATCHES,
  liveNote,
  mergeUpdate,
  replaces,
  runChain,
  type ChainUpdate,
  type PostStep,
} from "../src/run/live";
import { costByStep, modelsOf, runCost, runLabel } from "../src/run/cost";
import { formatUsd, formatUsdShort } from "../src/run/format";
import { LANES, STEP_KEYS, type Run, type RunSteps, type StepKey, type StepResult, type Trace } from "../src/run/types";

const clone = <T>(value: T): T => structuredClone(value);
const recorded = () => clone(recordedRun());

/** A trace as the API builds it. */
const trace = (over: Partial<Trace> = {}): Trace => ({
  step: "triage",
  source: "ai",
  model: "claude-haiku-4-5",
  attempts: 1,
  checks: [{ name: "Quote found in the ticket", passed: true, detail: "5 of 5" }],
  tokens: { input: 1000, output: 400 },
  cost: 0.003,
  reliability: "high",
  ...over,
});

/** The recorded steps, relabelled as if the model had answered. */
function aiSteps(): RunSteps {
  const steps = clone(recordedRun().steps);
  const relabel = <T>(r: StepResult<T>, step: string): StepResult<T> => ({ ...r, trace: trace({ step }) });
  for (const batch of steps.triage) {
    batch.trace = trace({ step: "triage" });
    for (const r of batch.data.results) r.source = "ai";
  }
  for (const key of STEP_KEYS)
    if (key !== "triage") (steps as Record<string, unknown>)[key] = relabel(steps[key] as StepResult<unknown>, key);
  return steps;
}

/** Answers every call from `steps`, recording each request. `override` can change or fail a step. */
function fakePost(
  steps: RunSteps,
  override: (step: StepKey, body: unknown) => StepResult<unknown> | Error | undefined = () => undefined,
) {
  const calls: { step: StepKey; body: unknown }[] = [];
  const post: PostStep = async (step, body) => {
    calls.push({ step, body });
    await Promise.resolve();
    const changed = override(step, body);
    if (changed instanceof Error) throw changed;
    if (changed) return changed;
    if (step === "triage") {
      const ids = (body as { ids: string[] }).ids;
      const batch = steps.triage.find((b) => b.data.results.some((r) => r.id === ids[0]))!;
      return batch;
    }
    return steps[step];
  };
  return { post, calls };
}

describe("the recorded run", () => {
  const run = recordedRun();

  it("loads, and covers all 40 tickets exactly once", () => {
    expect(run.source).toBe("recorded");
    const ids = run.steps.triage.flatMap((b) => b.data.results.map((r) => r.id));
    expect(ids).toEqual(TICKETS.map((t) => t.id));
    expect(run.steps.triage).toHaveLength(TRIAGE_BATCHES.length);
  });

  it("stores every step as { data, trace, ms }", () => {
    for (const key of STEP_KEYS) {
      const results = key === "triage" ? run.steps.triage : [run.steps[key]];
      for (const r of results) {
        expect(r.data).toBeTypeOf("object");
        expect(r.trace.source).toMatch(/^(ai|rules)$/);
        expect(r.ms).toBeTypeOf("number");
      }
    }
  });

  it("states what it is, and its total cost equals the sum of its traces", () => {
    expect(run.recording.totalCost).toBeCloseTo(runCost(run.steps), 10);
    expect(run.recording.models).toEqual(modelsOf(run.steps));
    expect(run.recording.source).toBe(run.recording.models.length ? "ai" : "rules");
    expect(runLabel(run)).toContain(run.recording.source === "rules" ? "rules only" : "AI");
  });

  it("is rejected when it is incomplete", () => {
    const raw = JSON.parse(JSON.stringify(run.recording)) as Record<string, unknown>;
    const full = { ...raw, steps: run.steps };
    expect(() => parseRecordedRun(full)).not.toThrow();
    expect(() => parseRecordedRun({ ...full, source: "maybe" })).toThrow(/source/);
    expect(() => parseRecordedRun({ ...full, steps: { ...run.steps, kb: undefined } })).toThrow(/steps\.kb/);
    expect(() => parseRecordedRun({ ...full, steps: { ...run.steps, triage: run.steps.triage.slice(1) } })).toThrow(
      /every ticket once/,
    );
    expect(() => parseRecordedRun(null)).toThrow(/object/);
  });
});

describe("lanes and the repeat rule", () => {
  const index = indexRun(recordedRun());

  it("puts every ticket in exactly one lane, and the counts add up", () => {
    const lanes = lanesOf(index);
    expect(LANES.flatMap((l) => lanes[l])).toHaveLength(TICKETS.length);
    const counts = laneCounts(index);
    for (const lane of LANES) expect(counts[lane]).toBe(lanes[lane].length);
  });

  it("maps actions to lanes, and holds a closure by a record-only runbook with enough earlier closures", () => {
    expect(laneOf({ action: "close_with_runbook", runbook: "RB-03" })).toBe("close");
    expect(laneOf({ action: "close_with_runbook", runbook: "RB-05" })).toBe("held");
    expect(laneOf({ action: "needs_human", runbook: "RB-05" })).toBe("person");
    expect(laneOf({ action: "escalation_candidate", runbook: "none" })).toBe("escalate");
    expect(laneOf({ action: "info_only", runbook: "none" })).toBe("info");
  });

  it("holds exactly the closures that name a record-only runbook already used often enough", () => {
    for (const entry of index.values()) {
      const shouldHold = entry.result.action === "close_with_runbook" && repeatRuleHolds(entry.result.runbook);
      expect(entry.lane === "held").toBe(shouldHold);
      expect(entry.repeatRule === null).toBe(!shouldHold);
    }
    expect(laneCounts(index).held).toBeGreaterThan(0);
  });

  it("computes the rule from the closed history, not from typed numbers", () => {
    const rule = repeatRuleFor("RB-05");
    expect(rule?.limit).toBe(REPEAT_LIMIT);
    expect(rule?.windowDays).toBe(WINDOW_DAYS);
    const expected = HISTORY.filter((h) => h.day >= -WINDOW_DAYS && h.resolution.startsWith("RB-05:"));
    expect(rule?.uses).toEqual(expected);
    expect(rule?.sites).toBe(new Set(expected.map((h) => h.site)).size);
    expect(priorUses("RB-05").length).toBeGreaterThanOrEqual(REPEAT_LIMIT);
  });

  it("does not apply to runbooks that change the charger, or to no runbook", () => {
    expect(repeatRuleHolds("RB-03")).toBe(false);
    expect(repeatRuleHolds("none")).toBe(false);
    expect(repeatRuleFor("RB-03")).toBeNull();
    expect(needsMeterCheck("RB-05")).toBe(true);
    expect(needsMeterCheck("RB-03")).toBe(false);
  });

  it("only treats an AI quote as a quote when it was verified in the ticket text; a rule's match is kept apart", () => {
    for (const entry of index.values()) {
      const verified = entry.result.source === "ai" && entry.result.quote_verified;
      expect(entry.quote === null).toBe(!verified);
      expect(entry.matched === null).toBe(entry.result.source !== "rules" || !entry.result.evidence);
      const shown = entry.quote ?? entry.matched;
      if (shown) expect(entry.ticket.text.toLowerCase()).toContain(shown.toLowerCase());
    }
  });

  it("labels every lane", () => {
    for (const lane of LANES) expect(LANE_LABEL[lane]).toBeTruthy();
  });
});

describe("provenance", () => {
  it("says AI, checked, with the model, checks and cost", () => {
    const p = provenanceOf("ai", trace({ cost: 0.0123 }), 2100);
    expect(p).toMatchObject({
      label: "AI, checked",
      model: "claude-haiku-4-5",
      reliability: "high",
      failedChecks: 0,
      ms: 2100,
    });
    expect(costText(p)).toBe("$0.012");
  });

  it("counts a failed check and keeps the answer marked medium", () => {
    const flagged = trace({
      reliability: "medium",
      checks: [{ name: "Numbers come from the input", passed: false, detail: "derived: 1234" }],
    });
    const p = provenanceOf("ai", flagged, 0);
    expect(p.failedChecks).toBe(1);
    expect(p.reliabilityNote).toMatch(/flagged/);
  });

  it("says Rules fallback and why, even inside an AI batch", () => {
    const batch = trace({ source: "ai", reliability: "medium" });
    const p = provenanceOf("rules", { ...batch, fallbackReason: "Rate limit" }, 0);
    expect(p).toMatchObject({
      label: "Rules fallback",
      model: "deterministic rules",
      reliability: "low",
      fallbackReason: "Rate limit",
    });
  });

  it("marks an unpriced model as a floor", () => {
    expect(costText({ cost: 0.004, unpriced: true })).toBe("$0.0040 +");
    expect(costText({ cost: 0, unpriced: false })).toBe("$0.00");
  });

  it("states what the checks of every step cover and leave to a person", () => {
    for (const key of STEP_KEYS) {
      expect(CHECK_SCOPE[key].checked).toBeTruthy();
      expect(CHECK_SCOPE[key].notChecked).toBeTruthy();
    }
  });

  it("formats cost without rounding small numbers to zero", () => {
    expect(formatUsd(0.00042)).toBe("$0.0004");
    expect(formatUsd(0.15)).toBe("$0.150");
    expect(formatUsdShort(0.002)).toBe("<$0.01");
    expect(formatUsdShort(0.0412)).toBe("$0.04");
  });

  it("totals the cost per step from the traces", () => {
    const steps = aiSteps();
    const rows = costByStep(steps);
    expect(rows.map((r) => r.step)).toEqual([...STEP_KEYS]);
    expect(rows.find((r) => r.step === "triage")).toMatchObject({
      calls: TRIAGE_BATCHES.length,
      aiCalls: TRIAGE_BATCHES.length,
    });
    expect(rows.reduce((n, r) => n + r.calls, 0)).toBe(CHAIN_CALLS);
    expect(runCost(steps)).toBeCloseTo(0.003 * CHAIN_CALLS, 10);
    expect(modelsOf(steps)).toEqual(["claude-haiku-4-5"]);
  });
});

describe("the live chain", () => {
  it("makes every call once, in dependency order, with the bodies the prototype sent", async () => {
    const base = recorded();
    const { post, calls } = fakePost(aiSteps());
    const report = await runChain({ post, base: base.steps });
    expect(calls).toHaveLength(CHAIN_CALLS);
    expect(report.answered).toBe(CHAIN_CALLS);

    const order = calls.map((c) => c.step);
    const at = (step: StepKey) => order.indexOf(step);
    expect(order.slice(0, TRIAGE_BATCHES.length).every((s) => s === "triage")).toBe(true);
    expect(at("patterns")).toBe(TRIAGE_BATCHES.length);
    expect(at("investigate")).toBeGreaterThan(at("patterns"));
    expect(at("handoff")).toBeGreaterThan(at("investigate"));
    expect(at("verify")).toBeGreaterThan(at("investigate"));
    expect(at("kb")).toBeGreaterThan(at("handoff"));
    expect(at("classify")).toBeGreaterThan(at("kb"));
    expect(at("shiftnote")).toBeGreaterThan(at("handoff"));

    const bodies = Object.fromEntries(calls.filter((c) => c.step !== "triage").map((c) => [c.step, c.body]));
    const triageBodies = calls.filter((c) => c.step === "triage").map((c) => (c.body as { ids: string[] }).ids);
    expect(triageBodies).toEqual(TRIAGE_BATCHES);
    expect((bodies["patterns"] as { triage: unknown[] }).triage).toHaveLength(TICKETS.length);
    expect((bodies["handoff"] as { investigation: unknown }).investigation).toEqual(base.steps.investigate.data);
    expect(bodies["kb"]).toEqual({ investigation: base.steps.investigate.data, handoff: base.steps.handoff.data });
    expect(bodies["classify"]).toEqual({ text: NEW_TICKET_EXAMPLE, article: base.steps.kb.data });
    expect((bodies["shiftnote"] as { summary: { open_at_start: number } }).summary.open_at_start).toBe(TICKETS.length);
  });

  it("merges answers as they land: the run turns live and tiles move lanes", async () => {
    let run: Run = recorded();
    const before = lanesOf(indexRun(run));
    const target = before.close[0]!;
    const steps = aiSteps();
    // The model decides differently for one ticket: a person should look at it.
    for (const batch of steps.triage)
      for (const r of batch.data.results)
        if (r.id === target) Object.assign(r, { action: "needs_human", runbook: "none" });

    const seen: ChainUpdate[] = [];
    const { post } = fakePost(steps);
    const report = await runChain({
      post,
      base: run.steps,
      onUpdate: (u) => {
        seen.push(u);
        run = mergeUpdate(run, u);
      },
    });

    expect(run.source).toBe("live");
    expect(seen.map((u) => u.settled)).toEqual(Array.from({ length: CHAIN_CALLS }, (_, i) => i + 1));
    const after = lanesOf(indexRun(run));
    expect(after.close).not.toContain(target);
    expect(after.person).toContain(target);
    expect(originCounts(indexRun(run))).toEqual({ ai: TICKETS.length, rules: 0 });
    // The merged run marks every answer it took from this live chain as live; otherwise the report and the run agree.
    expect(run.steps.triage.every((b) => b.live === true)).toBe(true);
    expect(report.steps?.triage).toEqual(run.steps.triage.map(({ live: _live, ...b }) => b));
    expect(liveNote(report)).toBeNull();
  });

  it("leaves the run recorded until something live is merged", () => {
    const run = recorded();
    expect(mergeUpdate(run, { outcome: "kept", step: "kb", result: run.steps.kb, settled: 1 })).toBe(run);
    expect(mergeUpdate(run, { outcome: "failed", step: "kb", message: "x", settled: 1 })).toBe(run);
  });

  it("adds up what a live run spent, repeats included", async () => {
    const { post } = fakePost(aiSteps());
    const first = await runChain({ post, base: recorded().steps });
    expect(first.spent).toBeCloseTo(0.003 * CHAIN_CALLS, 10);
  });

  it("keeps recorded AI results when the live answer is a rules fallback, and says so in one line", async () => {
    const base: Run = { ...recorded(), steps: aiSteps() };
    const limited = (step: StepKey): StepResult<unknown> => {
      const rules = recorded().steps;
      const r = step === "triage" ? rules.triage[0]! : rules[step];
      return {
        ...r,
        trace: trace({ source: "rules", model: "deterministic rules", cost: 0, fallbackReason: "Rate limit reached" }),
      };
    };
    const { post } = fakePost(rules(), (step) => limited(step));
    const updates: ChainUpdate[] = [];
    const report = await runChain({ post, base: base.steps, onUpdate: (u) => updates.push(u) });

    expect(updates.every((u) => u.outcome === "kept")).toBe(true);
    expect(report.steps).toEqual(base.steps);
    expect(report.keptRecorded).toHaveLength(STEP_KEYS.length);
    expect(report.aiAnswered).toBe(0);
    expect(liveNote(report)).toBe("No live model answered (Rate limit reached). The earlier results are kept.");
    let run = base;
    for (const u of updates) run = mergeUpdate(run, u);
    expect(run).toBe(base);
    expect(run.source).toBe("recorded");
  });

  it("replaces a rules result with a rules result, but never AI with rules", () => {
    const ai = { data: {}, ms: 0, trace: trace() };
    const rulesResult = { data: {}, ms: 0, trace: trace({ source: "rules" }) };
    expect(replaces(ai, rulesResult)).toBe(false);
    expect(replaces(rulesResult, rulesResult)).toBe(true);
    expect(replaces(rulesResult, ai)).toBe(true);
    expect(replaces(undefined, rulesResult)).toBe(true);
  });

  it("survives a failing step: the recorded result stays and later steps still run", async () => {
    const { post, calls } = fakePost(aiSteps(), (step) =>
      step === "patterns" ? new Error("The desk server didn't answer.") : undefined,
    );
    const base = recorded();
    const report = await runChain({ post, base: base.steps });
    expect(calls).toHaveLength(CHAIN_CALLS);
    expect(report.failures).toEqual([{ step: "patterns", message: "The desk server didn't answer." }]);
    expect(report.steps?.patterns).toEqual(base.steps.patterns);
    expect(report.steps?.investigate.trace.source).toBe("ai");
    expect(liveNote(report)).toMatch(
      /1 of 15 live calls didn't produce a model answer \(The desk server didn't answer\.\)/,
    );
  });

  it("reports an unreachable server as failed, with the recorded results shown", async () => {
    const post: PostStep = () => Promise.reject(new Error("fetch failed"));
    const base = recorded();
    const report = await runChain({ post, base: base.steps });
    expect(report.answered).toBe(0);
    expect(report.failures).toHaveLength(CHAIN_CALLS);
    expect(report.steps).toEqual(base.steps);
    expect(liveNote(report)).toBe(
      "The live run didn't reach the desk server (fetch failed). The earlier results stay.",
    );
  });

  it("stops quietly when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { post, calls } = fakePost(aiSteps());
    const report = await runChain({ post, base: recorded().steps, signal: controller.signal });
    expect(calls).toHaveLength(0);
    expect(report.failures).toEqual([]);
  });
});

describe("recording from nothing (npm run record)", () => {
  it("builds a complete set of steps that parses as a recorded run", async () => {
    const source = recordedRun().steps;
    const { post } = fakePost(source);
    const report = await runChain({ post });
    expect(report.steps).not.toBeNull();
    const file = {
      recordedAt: "2026-10-08T00:00:00.000Z",
      source: "rules",
      models: [],
      totalCost: 0,
      steps: report.steps,
    };
    expect(runFromRecording(parseRecordedRun(file)).steps.triage).toHaveLength(TRIAGE_BATCHES.length);
  });

  it("writes nothing usable when a step fails: dependants are skipped and the steps are null", async () => {
    const { post } = fakePost(recordedRun().steps, (step) => (step === "investigate" ? new Error("boom") : undefined));
    const report = await runChain({ post });
    expect(report.steps).toBeNull();
    const failed = report.failures.map((f) => f.step);
    expect(failed).toEqual(expect.arrayContaining(["investigate", "handoff", "kb", "classify", "shiftnote"]));
    expect(report.failures.find((f) => f.step === "handoff")?.message).toMatch(/Skipped/);
  });
});

describe("the shift summary", () => {
  it("is computed from the lanes", () => {
    const run = recordedRun();
    const index = indexRun(run);
    const lanes = lanesOf(index);
    const s = shiftSummary(index, run.steps.handoff.data.title);
    expect(s.open_at_start).toBe(TICKETS.length);
    expect(s.approved_for_closure).toBe(lanes.close.length);
    expect(s.still_open).toBe(TICKETS.length - lanes.close.length);
    expect(s.held_by_repeat_guardrail).toEqual(lanes.held);
    expect(s.needs_a_person).toHaveLength(lanes.person.length);
    expect(shiftSummary(index, "t", 3).still_open).toBe(TICKETS.length - 3);
  });
});

// An all-rules copy of the recorded steps, for fakePost.
function rules(): RunSteps {
  return clone(recordedRun().steps);
}
