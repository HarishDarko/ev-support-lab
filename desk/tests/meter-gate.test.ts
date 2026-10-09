import { describe, expect, it } from "vitest";
import { facts, type Decisions } from "../src/story/beats";
import { rulesStoryData, type StoryData } from "../src/story/data";

// v1's gate, restored in v2 after a regression review: a record-only runbook (RB-05) closes at the last recorded
// meter value, so a person confirms the meter before such a closure can be approved.

const none: Decisions = { approvedIds: [], sent: false, meterChecked: [] };

/** The rules data with one RB-05 closure that the repeat rule did not hold (as a live run could produce). */
function withOpenRb05(): { data: StoryData; id: string } {
  const data = rulesStoryData();
  const id = "T-2041";
  data.tickets = data.tickets.map((t) => (t.id === id ? { ...t, lane: "close", runbook: "RB-05" } : t));
  return { data, id };
}

describe("meter gate", () => {
  it("keeps an RB-05 closure out of the approvable set until the meter is checked", () => {
    const { data, id } = withOpenRb05();
    const f = facts(data, none);
    expect(f.lanes.close).toContain(id);
    expect(f.awaitingMeter).toEqual([id]);
    expect(f.approvable).not.toContain(id);
  });

  it("makes it approvable once a person checks the meter", () => {
    const { data, id } = withOpenRb05();
    const f = facts(data, { ...none, meterChecked: [id] });
    expect(f.awaitingMeter).toEqual([]);
    expect(f.approvable).toContain(id);
  });

  it("does not gate closures whose runbook is not record-only", () => {
    const f = facts(rulesStoryData(), none);
    expect(f.awaitingMeter).toEqual([]);
    expect(f.approvable).toEqual(f.lanes.close);
  });

  it("counts only approved closures, and is fully approved only when every approvable one is", () => {
    const { data, id } = withOpenRb05();
    const first = facts(data, none);
    const partly = facts(data, { ...none, approvedIds: first.approvable.slice(1) });
    expect(partly.approved).toBe(false);
    const all = facts(data, { ...none, approvedIds: first.approvable });
    expect(all.approved).toBe(true);
    expect(all.approvedCount).toBe(first.approvable.length);
    expect(all.approvedIds).not.toContain(id);
  });
});
