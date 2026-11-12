// SD-15, SaaS support: the token-refresh storm incident (INC-0527) on the desk. Every number and log line the
// walkthrough shows comes from the pack's synthetic data or the lab's own output (experiment.saas-support.json,
// copied from lab-saas/), the committed recording is what the rules answer with the model off, and nothing of the
// EV incident leaks into the SaaS screens. The .tsx modules are loaded by paths the test type-check does not follow.
import { describe, it, expect } from "vitest";
import lab from "../src/data/experiment.saas-support.json";
import committed from "../src/data/recorded-run.saas-support.json";
import { INCIDENT_STEPS, INCIDENT_SOURCES } from "../shared/packs/steps";
import { INCIDENT } from "../shared/packs/saas-support/incident";
import { RESULTS } from "../shared/packs/saas-support/results";
import { HANDOFF_NOTE, LAB_TEST_ATTACHMENT, ruleInvestigate, ruleKb } from "../shared/packs/saas-support/fallbacks";
import { SAAS_SUPPORT } from "../shared/packs/saas-support";
import { quoted } from "../functions/_lib/checks";
import { SAAS_INCIDENT } from "../src/incident/saas-support";
import { SAAS_DESK } from "../src/packs/saas-desk";
import { indexRun, lanesOf, shiftSummary } from "../src/run/selectors";
import { rulesStoryData, type StoryData } from "../src/story/data";
import { BEATS, facts, type Decisions } from "../src/story/beats";
import { packetMarkdown } from "../src/desk/handoff/packetMarkdown";
import { rulesRecording } from "../scripts/rules-run";

type Component = (props: Record<string, unknown>) => unknown;
const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

const none: Decisions = { approvedIds: [], sent: false, meterChecked: [] };
const all = (data: StoryData): Decisions => ({
  approvedIds: data.tickets.map((t) => t.id),
  sent: true,
  meterChecked: data.tickets.map((t) => t.id),
});
/** Words that belong to the EV incident only. */
const EV_WORDS = /charger|\bmeter\b|OCPP|FW-[ABC]|INC-0412|ENG-4471|RB-05|idle fee|unplug|firmware|\bsites?\b/i;
/** The first EV word in a text, so a failure names it. */
const evWord = (text: string) => EV_WORDS.exec(text)?.[0] ?? null;

describe("the SaaS incident's numbers come from the lab and the pack's synthetic data", () => {
  it("the server's story values equal the lab's committed output", () => {
    for (const arm of ["canary", "control"] as const)
      for (const w of ["before", "after"] as const) {
        const { endpoints: _e, failedAttempts: _f, waited: _w, replayed: _r, ...measured } = lab.windows[w][arm];
        expect(measured, `${w} ${arm}`).toEqual(RESULTS[arm][w]);
        expect(lab.windows[w][arm].endpoints).toBe(RESULTS[arm].endpoints);
      }
    expect(lab.settings.days).toBe(RESULTS.windowDays);
    expect(lab.storyComparison).toEqual([]);
  });

  it("the log excerpts the prompts quote are the lab's own, unchanged", () => {
    for (const log of INCIDENT.logs) expect(lab.logs.find((l) => l.title === log.title)).toEqual(log);
  });

  it("the detector's hits on the control are the control's storms in the lab", () => {
    expect(INCIDENT.detector.hits).toBe(lab.windows.after.control.storms);
  });

  it("the storms, pauses and rate limits in the endpoint view agree with each other", () => {
    const oauth = INCIDENT.breakdown.find((b) => b.auth.startsWith("OAuth"))!;
    expect(oauth.pauses).toBe(INCIDENT.rateLimited);
    expect(oauth.tokenExpiries).toBe(oauth.endpoints * 24 * 21);
    expect(INCIDENT.storms.every((s) => s.inFlight >= INCIDENT.burstThreshold)).toBe(true);
    // The lab's two captured storms have the in-flight counts the timing table shows.
    expect(lab.logs.find((l) => l.title.includes("T-3004"))!.lines[2]![2]).toMatch(/^32 deliveries in flight/);
    expect(INCIDENT.storms.find((s) => s.id === "T-3004")!.inFlight).toBe(32);
    expect(INCIDENT.storms.find((s) => s.id === "T-3024")!.inFlight).toBe(30);
  });
});

describe("the SaaS pack's incident steps", () => {
  it("runs the full chain on the server, with live calls still off", () => {
    expect(Object.keys(INCIDENT_STEPS["saas-support"]).sort()).toEqual(
      ["classify", "handoff", "investigate", "kb", "shiftnote", "verify"].sort(),
    );
    expect((SAAS_SUPPORT as { liveRuns?: boolean }).liveRuns).toBeUndefined();
    expect(SAAS_DESK.liveRuns).toBe(false);
  });

  it("every quoted evidence point in the rules' investigation is in the source it cites", () => {
    const sources = INCIDENT_SOURCES["saas-support"];
    for (const e of ruleInvestigate().evidence) {
      expect(Object.keys(sources), e.source).toContain(e.source);
      if (e.quote) expect(quoted(e.quote, sources[e.source]!), e.quote).toBe(true);
    }
  });

  it("builds its prompts from the SaaS incident, with none of EV's", () => {
    const steps = INCIDENT_STEPS["saas-support"];
    const prompts = [
      steps.investigate.build(),
      steps.handoff.build({ investigation: {} }),
      steps.verify.build(),
      steps.kb.build({ investigation: {}, handoff: {} }),
      steps.classify.build({ text: SAAS_SUPPORT.newTicketExample, article: ruleKb() }),
    ];
    for (const p of prompts) expect(evWord(p)).toBeNull();
    expect(prompts[0]).toContain("32 threads each request a new token (no shared refresh)");
    expect(prompts[1]).toContain(HANDOFF_NOTE);
    expect(prompts[1]).toContain(LAB_TEST_ATTACHMENT);
    expect(prompts[2]).toContain(`${RESULTS.canary.before.tokenRequests} token requests`);
  });
});

describe("the SaaS recording", () => {
  it("is what the rules answer with the model off (MOCK=1, no spend), apart from its date and timings", async () => {
    const fresh = await rulesRecording(SAAS_DESK, SAAS_INCIDENT, committed.recordedAt);
    const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x: unknown) => (k === "ms" ? 0 : x))) as unknown;
    expect(strip(fresh)).toEqual(strip(committed));
    expect(committed.source).toBe("rules");
    expect(committed.totalCost).toBe(0);
  });

  it("holds the three RB-14 closures of the pattern and links the two escalations", () => {
    const run = SAAS_DESK.recorded();
    const lanes = lanesOf(indexRun(run, SAAS_DESK), SAAS_DESK);
    expect(lanes.held).toEqual(INCIDENT.heldIds);
    for (const id of INCIDENT.openIds.filter((i) => !INCIDENT.heldIds.includes(i)))
      expect(lanes.escalate).toContain(id);
    const summary = shiftSummary(indexRun(run, SAAS_DESK), "t", undefined, SAAS_INCIDENT, SAAS_DESK);
    expect(summary.open_at_start).toBe(25);
    expect(summary.incident.ref).toBe("INC-0527");
    expect(summary.escalated.ref).toBe("ENG-5108");
  });
});

describe("the SaaS walkthrough", () => {
  const story = rulesStoryData(SAAS_DESK);

  it("tells its own story in every beat, with no EV words", () => {
    for (const decisions of [none, all(story)]) {
      const f = facts(story, decisions, SAAS_INCIDENT, SAAS_DESK);
      expect(f.total).toBe(25);
      expect(f.heldRunbook).toBe("RB-14");
      expect(f.prior).toBe(4);
      for (const b of BEATS) {
        const text = `${b.when(f)} | ${b.claim(f)} | ${b.lede(f)}`;
        expect(evWord(text), b.id).toBeNull();
        expect(b.claim(f).trim(), b.id).not.toBe("");
      }
    }
    const f = facts(story, none, SAAS_INCIDENT, SAAS_DESK);
    const v3 = BEATS.find((b) => b.id === "v3")!;
    expect(v3.claim(f)).toBe("Canary 9 → 0. Control 8 → 9.");
  });

  it("says the incident is synthetic and reproduced in a lab", () => {
    expect(SAAS_INCIDENT.logs.lede).toMatch(/^Synthetic/);
    expect(SAAS_INCIDENT.replays.caption).toMatch(/^Synthetic/);
    expect(SAAS_INCIDENT.detector.title).toMatch(/\(synthetic\)/);
    expect(SAAS_INCIDENT.verification.bars.caption).toMatch(/synthetic traffic/);
    expect(ruleKb().title).toBe("Webhook endpoint paused after a burst of token requests at token expiry");
  });

  it("renders the board at every beat, the desk tabs and the packet with no EV words", async () => {
    const react = await load("react");
    const h = react["createElement"] as (type: unknown, props?: unknown, ...c: unknown[]) => unknown;
    const { renderToStaticMarkup } = (await load("react-dom/server")) as {
      renderToStaticMarkup: (el: unknown) => string;
    };
    const { RunProvider } = (await load("../src/run/useRun")) as { RunProvider: Component };
    const { IncidentContext } = (await load("../src/incident")) as { IncidentContext: { Provider: unknown } };
    const { Board } = (await load("../src/board/Board")) as { Board: Component };
    const tabs = await Promise.all(
      [
        ["../src/desk/incident/IncidentTab", "IncidentTab"],
        ["../src/desk/handoff/HandoffTab", "HandoffTab"],
        ["../src/desk/queue/QueueTab", "QueueTab"],
        ["../src/desk/kb/KnowledgeBaseTab", "KnowledgeBaseTab"],
        ["../src/desk/scorecard/ScorecardTab", "ScorecardTab"],
      ].map(async ([path, name]) => (await load(path!))[name!] as Component),
    );
    const render = (el: unknown) =>
      renderToStaticMarkup(
        h(IncidentContext.Provider, { value: SAAS_INCIDENT }, h(RunProvider, { pack: SAAS_DESK }, el)),
      );
    const html: string[] = tabs.map((t) => render(h(t)));
    for (const decisions of [none, all(story)]) {
      const f = facts(story, decisions, SAAS_INCIDENT, SAAS_DESK);
      BEATS.forEach((b, at) =>
        html.push(render(h(Board, { at, beat: b.id, data: story, f, onOpenTicket: () => undefined }))),
      );
    }
    html.push(packetMarkdown(story.handoff, SAAS_INCIDENT));
    // The words a visitor reads: tags and their class names (such as tickets-site) are left out.
    html.forEach((page, i) => expect(evWord(page.replace(/<[^>]*>/g, " ")), `page ${i}`).toBeNull());
    const joined = html.join("\n");
    for (const text of ["INC-0527", "ENG-5108", "TokenStormReproductionTest", "T-3024", "Harbor Analytics"])
      expect(joined).toContain(text);
    // No live run for this pack yet: the run controls say so instead of offering one.
    expect(joined).not.toContain("Run it live");
  });
});
