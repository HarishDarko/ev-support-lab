// The desk's pure logic: coverage hours, the detector, incident numbers, the handoff Markdown, the classifier.
import { describe, it, expect } from "vitest";
import { DETECTOR, ESCALATION_LINE, HERO, META, NEW_TICKET_EXAMPLE } from "../src/data/synthetic";
import { clock, coverageBands, minutes, overlap, segments } from "../src/desk/coverage/coverage";
import {
  FLAT_MINUTES,
  RECONNECT_SECONDS,
  detectorReason,
  detectorRun,
  isCandidate,
} from "../src/desk/incident/detector";
import {
  RECORD_ONLY_RUNBOOK,
  fastestDropSec,
  incidentPattern,
  logFlag,
  slowestDropSec,
  sortedTimings,
  stuckByFirmware,
  stuckShare,
} from "../src/desk/incident/evidence";
import { packetMarkdown } from "../src/desk/handoff/packetMarkdown";
import { DESK_TABS, isDeskTab } from "../src/desk/tabs";
import { classifyTicket } from "../src/run/classify";
import { recordedRun } from "../src/run/recorded";
import { indexRun, lanesOf } from "../src/run/selectors";
import type { PostStep } from "../src/run/live";
import type { PatternModel } from "../src/run/types";

describe("coverage hours", () => {
  const bands = Object.fromEntries(coverageBands().map((b) => [b.id, b]));

  it("reads clock times and writes them back", () => {
    expect(minutes("07:00")).toBe(420);
    expect(clock(minutes("23:30"))).toBe("23:30");
    expect(clock(24 * 60)).toBe("00:00");
    expect(() => minutes("noon")).toThrow();
  });

  it("splits an interval that wraps midnight into two", () => {
    expect(segments({ start: minutes("23:30"), end: minutes("08:30") })).toEqual([
      [1410, 1440],
      [0, 510],
    ]);
  });

  it("takes the India hours and the shift start from the data", () => {
    expect(META.indiaShiftET).toBe("23:30–08:30 ET");
    expect(bands["india"]?.range).toBe("23:30–08:30 ET");
    expect(bands["shift"]?.range).toBe("07:00–15:30 ET");
    expect(bands["noc"]?.range).toBe("24/7");
  });

  it("computes the overlap and the evening instead of typing them", () => {
    expect(bands["overlap"]?.range).toBe("07:00–08:30 ET");
    expect(bands["evening"]?.range).toBe("15:30–23:30 ET");
    const shift = { start: minutes("07:00"), end: minutes("15:30") };
    const india = { start: minutes("23:30"), end: minutes("08:30") };
    expect(overlap(shift, india)).toEqual([[420, 510]]);
    expect(overlap({ start: 0, end: 60 }, { start: 120, end: 180 })).toEqual([]);
  });
});

describe("the detector", () => {
  it("uses the thresholds written in its own query", () => {
    expect(DETECTOR.query).toContain(`>= ${FLAT_MINUTES}`);
    expect(DETECTOR.query).toContain(`${RECONNECT_SECONDS}s`);
  });

  it("flags a session only when it was flat long enough and reconnected soon after unplug, and says why not otherwise", () => {
    const run = detectorRun();
    expect(run.sessions).toHaveLength(DETECTOR.sessions.length);
    for (const { session, candidate, reason } of run.sessions) {
      expect(candidate).toBe(isCandidate(session));
      expect(reason).toBe(detectorReason(session));
    }
    const byId = Object.fromEntries(run.sessions.map((s) => [s.session.id, s]));
    expect(byId["SX-88402"]?.candidate).toBe(true);
    expect(byId["SX-88420"]?.reason).toMatch(/under the 30 min threshold/);
    expect(byId["SX-88431"]?.reason).toMatch(/No reconnect/);
    expect(byId["SX-88437"]?.reason).toMatch(/outside 90 s/);
  });
});

describe("incident numbers", () => {
  it("counts stuck sessions per firmware from the timings, and they add up to the incident", () => {
    const counts = stuckByFirmware();
    expect(counts.reduce((n, [, c]) => n + c, 0)).toBe(HERO.totalTickets);
    expect(counts[0]).toEqual(["FW-B", 12]);
  });

  it("sorts the timings and finds the range", () => {
    const times = sortedTimings().map((t) => t.s);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(fastestDropSec()).toBe(times[0]);
    expect(slowestDropSec()).toBe(times.at(-1));
  });

  it("keeps the denominators: 12 of 19 stays 63 percent only as a derived share", () => {
    const [fwB] = HERO.fleet;
    expect(fwB?.stuck).toBe(12);
    expect(stuckShare(fwB!)).toBe(63);
    expect(stuckShare({ ...fwB!, dropsNearUnplug: 0 })).toBe(0);
  });

  it("names the record-only runbook and the escalation triggers that fired", () => {
    expect(RECORD_ONLY_RUNBOOK).toBe("RB-05");
    expect(ESCALATION_LINE.heroTriggers).toEqual(["code", "spread", "billing"]);
  });

  it("picks the pattern that holds the held tickets", () => {
    const run = recordedRun();
    const held = lanesOf(indexRun(run)).held;
    const found = incidentPattern(run.steps.patterns.data.patterns, held);
    expect(found).not.toBeNull();
    expect(held.every((id) => found?.ticket_ids.includes(id))).toBe(true);
    const decoy: PatternModel = { ...found!, name: "Other", ticket_ids: ["T-2040", "T-2042"], history_ids: [] };
    expect(incidentPattern([decoy, found!], held)?.name).toBe(found?.name);
    expect(incidentPattern([], held)).toBeNull();
  });

  it("flags the log lines where the transaction should have closed", () => {
    expect(logFlag("TransactionEvent Ended transactionId=87640 ignored: connector already Available")).toBe("ignored");
    expect(logFlag("transactionId=88213 state=Charging (no TransactionEvent Ended received)")).toBe("missing");
    expect(logFlag("connection lost (websocket 1006, no close frame)")).toBe("dropped");
    expect(logFlag("websocket opened CP-014-02")).toBeNull();
  });
});

describe("the handoff as Markdown", () => {
  it("carries the packet, the attachments and the synthetic label", () => {
    const md = packetMarkdown(recordedRun().steps.handoff.data);
    expect(md).toContain("## The ask");
    expect(md).toContain("## Evidence attached");
    expect(md).toContain(`Attached: fleet view, last ${-HERO.firstSeenDay} days`);
    for (const log of HERO.logs) expect(md).toContain(log.title);
    for (const id of [...HERO.openIds, ...HERO.historyIds]) expect(md).toContain(id);
    expect(md.trimEnd().endsWith("(Synthetic data, prototype)")).toBe(true);
  });
});

describe("the desk tabs", () => {
  it("are the six in the spec, in order", () => {
    expect(DESK_TABS.map((t) => t.id)).toEqual(["queue", "incident", "handoff", "kb", "coverage", "scorecard"]);
    expect(isDeskTab("kb")).toBe(true);
    expect(isDeskTab("nonsense")).toBe(false);
    expect(isDeskTab(null)).toBe(false);
  });
});

describe("the new-ticket check", () => {
  const article = recordedRun().steps.kb.data;

  it("passes a live answer through, marked as live", async () => {
    const answer = recordedRun().steps.classify;
    const post: PostStep = (step, body) => {
      expect(step).toBe("classify");
      expect(body).toEqual({ text: NEW_TICKET_EXAMPLE, article });
      return Promise.resolve(answer);
    };
    expect(await classifyTicket(post, NEW_TICKET_EXAMPLE, article)).toEqual({ ...answer, live: true });
  });

  it("falls back to the rules, labelled, when the call fails", async () => {
    const post: PostStep = () => Promise.reject(new Error("The desk server didn't answer."));
    const result = await classifyTicket(post, NEW_TICKET_EXAMPLE, article);
    expect(result.trace).toMatchObject({
      source: "rules",
      model: "deterministic rules",
      cost: 0,
      fallbackReason: "The desk server didn't answer.",
    });
    expect(result.data.matches_known_pattern).toBe(true);
    expect(result.data.confirm).toMatch(/meter/);
  });

  it("never sends a ticket outside the pattern to the runbook, even on the fallback", async () => {
    const post: PostStep = () => Promise.reject(new Error("offline"));
    const text = "Session open 6h, but energy still climbing at 7 kW. Charging.";
    const result = await classifyTicket(post, text, article);
    expect(result.data.matches_known_pattern).toBe(false);
    expect(result.data.escalate).toBe(true);
  });

  it("rethrows when the visitor navigates away", async () => {
    const controller = new AbortController();
    controller.abort();
    const post: PostStep = () => Promise.reject(new Error("aborted"));
    await expect(classifyTicket(post, "x", article, controller.signal)).rejects.toThrow("aborted");
  });
});
