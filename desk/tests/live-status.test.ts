// SD-04 and the run status: the live chain starts the investigation and the verification at once, and the
// "Run it live" controls say in plain words which step is running and about how long is left.
// Fake timers stand in for the model: each call takes the recorded run's own time for that step.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordedRun } from "../src/run/recorded";
import { CHAIN_CALLS, TRIAGE_BATCHES, chainCalls, runChain, triageBatches, type PostStep } from "../src/run/live";
import { EV_DESK } from "../src/run/pack";
import { SAAS_DESK } from "../src/packs/saas-desk";
import { SHOP_DESK } from "../src/packs/ecommerce-desk";
import { chainSeconds } from "../src/run/cost";
import { runShortChain } from "../src/run/short";
import { runStatusText, secondsLeft, slowestFirst } from "../src/run/status";
import type { StepKey, StepResult } from "../src/run/types";

const steps = recordedRun().steps;

/** The recorded result for a call, and how long the recorded call took. */
function recordedAnswer(step: StepKey, body: unknown): StepResult<unknown> {
  if (step !== "triage") return steps[step];
  const ids = (body as { ids: string[] }).ids;
  return steps.triage[TRIAGE_BATCHES.findIndex((b) => b[0] === ids[0])]!;
}

/** A post that answers after the recorded time and notes when each call started and ended. */
function timedPost(answer: (step: StepKey, body: unknown) => StepResult<unknown>) {
  const started: [StepKey, number][] = [];
  const ended: [StepKey, number][] = [];
  const post: PostStep = (step, body) => {
    started.push([step, Date.now()]);
    const result = answer(step, body);
    return new Promise((resolve) =>
      setTimeout(() => {
        ended.push([step, Date.now()]);
        resolve(result);
      }, result.ms),
    );
  };
  const at = (list: [StepKey, number][], step: StepKey) => list.filter(([s]) => s === step).map(([, t]) => t);
  return { post, startOf: (s: StepKey) => at(started, s), endOf: (s: StepKey) => at(ended, s), ended };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("the live chain's timing (SD-04)", () => {
  it("starts the triage batches, the investigation and the verification at once", async () => {
    const { post, startOf, endOf, ended } = timedPost(recordedAnswer);
    const done = runChain({ post, base: steps });
    await vi.runAllTimersAsync();
    const report = await done;

    expect(report.answered).toBe(CHAIN_CALLS);
    expect(startOf("triage")).toEqual(TRIAGE_BATCHES.map(() => 0));
    expect(startOf("investigate")).toEqual([0]);
    expect(startOf("verify")).toEqual([0]);
    // What still waits: patterns for all of triage, the handoff for the investigation, and so on.
    const triageEnd = Math.max(...endOf("triage"));
    expect(startOf("patterns")).toEqual([triageEnd]);
    expect(startOf("handoff")).toEqual(endOf("investigate"));
    expect(startOf("kb")).toEqual(endOf("handoff"));
    expect(startOf("classify")).toEqual(endOf("kb"));
    expect(startOf("shiftnote")).toEqual([Math.max(triageEnd, endOf("handoff")[0]!)]);
    // The modelled end of the chain, from the recorded step times.
    const last = Math.max(...ended.map(([, t]) => t));
    expect(Math.round(last / 1000)).toBe(chainSeconds(steps));
  });

  it("is modelled at about 26 seconds for the committed recorded run (it was 42 one step after another)", () => {
    expect(chainSeconds(steps)).toBe(26);
  });

  it("tells the caller when each call starts", async () => {
    const { post } = timedPost(recordedAnswer);
    const starts: StepKey[] = [];
    const done = runChain({ post, base: steps, onStart: (step) => starts.push(step) });
    await vi.runAllTimersAsync();
    await done;
    expect(starts).toHaveLength(CHAIN_CALLS);
    expect(starts.slice(0, TRIAGE_BATCHES.length + 2)).toEqual([
      ...TRIAGE_BATCHES.map(() => "triage"),
      "investigate",
      "verify",
    ]);
  });
});

describe("the live chain's timing for each industry (SD-04 on the pack-aware run model)", () => {
  for (const pack of [EV_DESK, SAAS_DESK, SHOP_DESK]) {
    it(`${pack.id}: starts its own triage batches, the investigation and the verification at once`, async () => {
      const own = pack.recorded().steps;
      const batches = triageBatches(pack);
      const bodies: unknown[] = [];
      // Every call takes 1 s here: the rules-only recordings of SaaS and e-commerce have near-zero step times.
      const { post, startOf } = timedPost((step, body) => {
        bodies.push(body);
        if (step !== "triage") return { ...own[step], ms: 1000 } as StepResult<unknown>;
        const ids = (body as { ids: string[] }).ids;
        return { ...own.triage[batches.findIndex((b) => b[0] === ids[0])]!, ms: 1000 } as StepResult<unknown>;
      });
      const done = runChain({ post, base: own, pack });
      await vi.runAllTimersAsync();
      const report = await done;

      expect(report.answered).toBe(chainCalls(pack));
      expect(startOf("triage")).toEqual(batches.map(() => 0));
      expect(startOf("investigate")).toEqual([0]);
      expect(startOf("verify")).toEqual([0]);
      expect(startOf("patterns")).toEqual([1000]);
      expect(startOf("handoff")).toEqual([1000]);
      expect(startOf("shiftnote")).toEqual([2000]);
      expect(startOf("kb")).toEqual([2000]);
      expect(startOf("classify")).toEqual([3000]);
      // A pack other than EV charging is named in every request; EV's requests carry no pack, as before.
      for (const body of bodies) expect((body as { pack?: string }).pack).toBe(pack.requestPack);
    });
  }
});

describe("the short chain's shift note", () => {
  it("starts right after triage, without waiting for patterns or the article", async () => {
    const answer = (step: StepKey, body: unknown): StepResult<unknown> => {
      const ids = (body as { ids?: string[] }).ids ?? [];
      const data =
        step === "triage"
          ? { results: ids.map((id) => ({ id, action: "close_with_runbook", summary: id })) }
          : step === "patterns"
            ? {
                patterns: [
                  { name: "p", ticket_ids: ids.length ? ids : ["T-1", "T-2"], recurring: true, why_grouped: "" },
                ],
              }
            : {};
      return { data, trace: { source: "rules", cost: 0 } as StepResult<unknown>["trace"], ms: 1000 };
    };
    const { post, startOf, endOf } = timedPost(answer);
    const done = runShortChain({ pack: { id: "stub", ticketIds: ["T-1", "T-2"] }, post });
    await vi.runAllTimersAsync();
    await done;
    expect(startOf("shiftnote")).toEqual(endOf("triage"));
    expect(startOf("shiftnote")[0]!).toBeLessThan(endOf("kb")[0]!);
  });
});

describe("the status line while a live run goes", () => {
  const base = { settled: 9, total: 15, ai: 9, spent: 0.06, unpriced: false };

  it("names the step that is running, in plain words, and the time left", () => {
    expect(runStatusText({ ...base, inFlight: ["investigate"], secondsLeft: 15 })).toBe(
      "Claude is writing the investigation. 9 of 15 answers in, about 15 seconds left. Live · $0.06 so far",
    );
  });

  it("names two steps, or the slowest one and how many others", () => {
    expect(runStatusText({ ...base, inFlight: ["investigate", "patterns"], secondsLeft: 9 })).toContain(
      "Claude is writing the investigation and looking for patterns across the tickets.",
    );
    expect(runStatusText({ ...base, inFlight: ["investigate", "patterns", "verify"], secondsLeft: 9 })).toContain(
      "Claude is writing the investigation, and 2 other steps are running.",
    );
  });

  it("counts the triage batches as one step", () => {
    expect(runStatusText({ ...base, settled: 0, ai: 0, inFlight: ["triage", "triage"], secondsLeft: 26 })).toMatch(
      /^Claude is reading and sorting the tickets\. 0 of 15 answers in, about 26 seconds left\./,
    );
  });

  it("says almost done once the usual time has passed, and one second in the singular", () => {
    expect(runStatusText({ ...base, inFlight: ["classify"], secondsLeft: 0 })).toContain(
      "9 of 15 answers in, almost done.",
    );
    expect(runStatusText({ ...base, inFlight: ["classify"], secondsLeft: 1 })).toContain("about 1 second left.");
  });

  it("says so when only the rules are answering", () => {
    expect(runStatusText({ ...base, ai: 0, inFlight: ["investigate"], secondsLeft: 12 })).toMatch(
      /^No model has answered yet, so the rules are writing the investigation\./,
    );
  });

  it("orders the steps in flight slowest first, from the recorded times", () => {
    expect(slowestFirst(["verify", "triage", "investigate"], steps)).toEqual(["investigate", "triage", "verify"]);
  });

  it("counts down from the modelled time and stops at zero", () => {
    expect(secondsLeft(26, 0)).toBe(26);
    expect(secondsLeft(26, 10_400)).toBe(16);
    expect(secondsLeft(26, 40_000)).toBe(0);
  });
});
