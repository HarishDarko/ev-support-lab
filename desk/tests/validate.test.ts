import { describe, it, expect } from "vitest";
import {
  normalize,
  quoted,
  ungroundedNumbers,
  mentions,
  runbookException,
  exceptionNames,
  check,
} from "../functions/_lib/validate";
import { costOf, clip, StepError, models } from "../functions/_lib/ai";

describe("normalize", () => {
  it("lowercases, unifies quotes and arrows, collapses spacing", () => {
    expect(normalize("  It’s   “OK” → done – fine ")).toBe(`it's "ok" -> done - fine`);
    expect(normalize(undefined)).toBe("");
  });
});

describe("quoted", () => {
  const src = "Driver says the app still showed 'Charging' hours after they unplugged.";
  it("accepts an exact quote, ignoring case and spacing", () => {
    expect(quoted("STILL showed  'charging'", src)).toBe(true);
  });
  it("rejects a quote that is not in the source", () => {
    expect(quoted("the charger exploded", src)).toBe(false);
  });
  it("rejects quotes too short to mean anything", () => {
    expect(quoted("app", src)).toBe(false);
    expect(quoted("", src)).toBe(false);
  });
  it("accepts an ellipsis quote only when the pieces appear in order", () => {
    expect(quoted("Driver says ... hours after they unplugged", src)).toBe(true);
    expect(quoted("hours after they unplugged ... Driver says", src)).toBe(false);
  });
  it("rejects reordered sentences", () => {
    expect(quoted("unplugged hours after", src)).toBe(false);
  });
});

describe("mentions", () => {
  it("an empty term list always passes; otherwise one term must appear", () => {
    expect(mentions("anything", [])).toBe(true);
    expect(mentions("Badge rejected", ["badge"])).toBe(true);
    expect(mentions("Badge rejected", ["hold"])).toBe(false);
  });
});

describe("ungroundedNumbers", () => {
  it("flags numbers of 4+ or with decimals that are not in the input", () => {
    expect(
      ungroundedNumbers({ a: "14 tickets, 3 sites, 4812 sessions, 2.5 hours" }, "14 tickets 4812 sessions"),
    ).toEqual(["2.5"]);
  });
  it("ignores small whole numbers", () => {
    expect(ungroundedNumbers("2 and 3", "")).toEqual([]);
  });
});

describe("runbook exceptions", () => {
  it("RB-03: a reset that already failed goes to a person", () => {
    expect(runbookException("RB-03", "Soft reset sent at 12:30, no response.")?.name).toBe("reset already tried");
    expect(runbookException("RB-03", "CP-011-02 no heartbeat for 52 min.")).toBeNull();
  });
  it("RB-05: names all three tests, in order", () => {
    expect(exceptionNames("RB-05")).toEqual([
      "energy still moving",
      "no connection drop near unplug",
      "firmware outside FW-A and FW-B",
    ]);
  });
  it("RB-05: other firmware is an exception; FW-A and FW-B are not", () => {
    expect(runbookException("RB-05", "stuck session", "FW-C 1.6.2")?.name).toBe("firmware outside FW-A and FW-B");
    expect(runbookException("RB-05", "stuck session", "FW-B 4.2.1")).toBeNull();
    expect(runbookException("RB-05", "stuck session", "FW-A 3.9.0")).toBeNull();
  });
  it("a runbook with no exceptions never raises one", () => {
    expect(runbookException("RB-01", "anything at all")).toBeNull();
    expect(exceptionNames("RB-01")).toEqual([]);
  });
});

describe("check", () => {
  it("builds a trace entry", () => {
    expect(check("n", true)).toEqual({ name: "n", passed: true, detail: "" });
  });
});

describe("cost accounting", () => {
  it("prices the two known models at list price per million tokens", () => {
    expect(costOf("claude-haiku-4-5", { input: 1_000_000, output: 1_000_000 })).toBe(6);
    expect(costOf("claude-sonnet-5-5", { input: 1_000_000, output: 1_000_000 })).toBe(12);
  });
  it("matches by prefix, returns null for an unknown model and 0 for no usage", () => {
    expect(costOf("claude-haiku-4-5-20260101", { input: 1000, output: 0 })).toBeCloseTo(0.001, 10);
    expect(costOf("mystery", { input: 1, output: 1 })).toBeNull();
    expect(costOf("mystery", undefined)).toBe(0);
  });
});

describe("clip and models", () => {
  it("clip serialises small values and refuses large ones with a 400", () => {
    expect(clip({ a: 1 })).toBe('{"a":1}');
    expect(clip(undefined)).toBe("null");
    expect(() => clip("x".repeat(7000))).toThrow(StepError);
    try {
      clip("x".repeat(7000));
    } catch (e) {
      expect((e as StepError).status).toBe(400);
    }
  });
  it("models come from the environment with defaults", () => {
    expect(models({})).toEqual({ fast: "claude-haiku-4-5", deep: "claude-sonnet-5-5" });
    expect(models({ FAST_MODEL: "a", DEEP_MODEL: "b" })).toEqual({ fast: "a", deep: "b" });
    expect(models({ FAST_MODEL: "" })).toEqual({ fast: "claude-haiku-4-5", deep: "claude-sonnet-5-5" });
  });
});
