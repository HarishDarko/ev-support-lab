// SD-15, e-commerce: the second-authorization incident (INC-0539) on the desk. Every number and log line the
// walkthrough shows comes from the pack's synthetic data or the lab's own output (experiment.e-commerce.json, copied
// from lab-ecommerce/), the committed recording is what the rules answer with the model off, and nothing of the EV
// or SaaS incidents leaks into the e-commerce screens. The .tsx modules are loaded by paths the test type-check does
// not follow.
import { describe, it, expect } from "vitest";
import lab from "../src/data/experiment.e-commerce.json";
import committed from "../src/data/recorded-run.e-commerce.json";
import { INCIDENT_STEPS, INCIDENT_SOURCES } from "../shared/packs/steps";
import { INCIDENT } from "../shared/packs/e-commerce/incident";
import { RESULTS } from "../shared/packs/e-commerce/results";
import { HANDOFF_NOTE, LAB_TEST_ATTACHMENT, ruleInvestigate, ruleKb } from "../shared/packs/e-commerce/fallbacks";
import { E_COMMERCE } from "../shared/packs/e-commerce";
import { quoted } from "../functions/_lib/checks";
import { SHOP_INCIDENT } from "../src/incident/e-commerce";
import { SHOP_DESK } from "../src/packs/ecommerce-desk";
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
/** Words that belong to the EV or SaaS incidents only. The shop has a "Site monitor" (its website), so only EV's
 * plural "sites" counts. */
const OTHER_WORDS =
  /charger|\bmeter\b|OCPP|FW-[ABC]|INC-0412|ENG-4471|RB-05|idle fee|unplug|firmware|\bsites\b|INC-0527|ENG-5108|RB-14|webhook endpoint|token storm|identity provider/i;
/** The first such word in a text, so a failure names it. */
const otherWord = (text: string) => OTHER_WORDS.exec(text)?.[0] ?? null;

describe("the e-commerce incident's numbers come from the lab and the pack's synthetic data", () => {
  it("the server's story values equal the lab's committed output", () => {
    for (const arm of ["canary", "control"] as const)
      for (const w of ["before", "after"] as const) {
        const { stores, ...measured } = lab.windows[w][arm];
        expect(measured, `${w} ${arm}`).toEqual(RESULTS[arm][w]);
        expect(stores).toBe(RESULTS[arm].stores);
      }
    expect(lab.settings.days).toBe(RESULTS.windowDays);
    expect(lab.storyComparison.filter((c) => !c.matches)).toEqual([]);
    expect(SHOP_INCIDENT.verification.differences).toEqual([]);
  });

  it("the log excerpts the prompts quote are the lab's own, unchanged, and the desk shows the same three", () => {
    for (const log of INCIDENT.logs) expect(lab.logs.find((l) => l.title === log.title)).toEqual(log);
    expect(SHOP_INCIDENT.logs.excerpts.map((l) => l.title)).toEqual(INCIDENT.logs.map((l) => l.title));
  });

  it("the lab's captured orders have the first-answer times the timing table shows", () => {
    for (const [ticket, order] of [
      ["T-4002", "#51102"],
      ["T-4010", "#51209"],
      ["T-4018", "#51388"],
      ["T-4022", "#52388"],
    ] as const) {
      const log = lab.logs.find((l) => l.title.startsWith(`${ticket}:`))!;
      const first = log.lines.map((x) => x[2] ?? "").find((d) => d.includes("_a1  (answered in"))!;
      const seconds = Number(/answered in ([\d.]+) s/.exec(first)![1]);
      const row = INCIDENT.orders.find((o) => o.id === ticket)!;
      expect(row.order, ticket).toBe(order);
      expect(row.firstAnswer, ticket).toBe(seconds);
      expect(seconds, ticket).toBeGreaterThan(INCIDENT.timeoutSeconds);
    }
  });

  it("the channel view, the orders and the ticket counts agree with each other", () => {
    const sum = (k: "slow" | "newKey" | "secondAuth" | "stuck" | "bothCaptured") =>
      INCIDENT.breakdown.reduce((s, b) => s + b[k], 0);
    expect([sum("slow"), sum("newKey"), sum("secondAuth"), sum("stuck"), sum("bothCaptured")]).toEqual([
      25, 11, 11, 9, 2,
    ]);
    expect(sum("bothCaptured")).toBe(INCIDENT.chargedTwice);
    expect(INCIDENT.orders).toHaveLength(INCIDENT.totalTickets);
    expect(INCIDENT.orders.filter((o) => o.outcome.startsWith("Both captured"))).toHaveLength(INCIDENT.chargedTwice);
    expect(INCIDENT.orders.every((o) => o.firstAnswer > INCIDENT.timeoutSeconds)).toBe(true);
    expect([...INCIDENT.openIds, ...INCIDENT.historyIds]).toHaveLength(INCIDENT.totalTickets);
    expect(lab.settings.checkoutTimeoutSeconds).toBe(INCIDENT.timeoutSeconds);
  });
});

describe("the e-commerce pack's incident steps", () => {
  it("runs the full chain on the server, with live calls still off", () => {
    expect(Object.keys(INCIDENT_STEPS["e-commerce"]).sort()).toEqual(
      ["classify", "handoff", "investigate", "kb", "shiftnote", "verify"].sort(),
    );
    expect((E_COMMERCE as { liveRuns?: boolean }).liveRuns).toBeUndefined();
    expect(SHOP_DESK.liveRuns).toBe(false);
  });

  it("every quoted evidence point in the rules' investigation is in the source it cites", () => {
    const sources = INCIDENT_SOURCES["e-commerce"];
    for (const e of ruleInvestigate().evidence) {
      expect(Object.keys(sources), e.source).toContain(e.source);
      if (e.quote) expect(quoted(e.quote, sources[e.source]!), e.quote).toBe(true);
    }
  });

  it("builds its prompts from the e-commerce incident, with none of EV's or SaaS's", () => {
    const steps = INCIDENT_STEPS["e-commerce"];
    const prompts = [
      steps.investigate.build(),
      steps.handoff.build({ investigation: {} }),
      steps.verify.build(),
      steps.kb.build({ investigation: {}, handoff: {} }),
      steps.classify.build({ text: E_COMMERCE.newTicketExample, article: ruleKb() }),
    ];
    for (const p of prompts) expect(otherWord(p)).toBeNull();
    expect(prompts[0]).toContain("#51102 extra authorization au_96FA on a captured order -> hold: Payment pending");
    expect(prompts[1]).toContain(HANDOFF_NOTE);
    expect(prompts[1]).toContain(LAB_TEST_ATTACHMENT);
    expect(prompts[2]).toContain(`${RESULTS.control.after.secondAuthorization} second authorizations`);
  });

  it("the KB step keeps the capture check first and the payments-review flag last", () => {
    const kb = INCIDENT_STEPS["e-commerce"].kb;
    const article = {
      ...ruleKb(),
      steps: ["Check the processor shows one capture.", "Apply RB-21.", "Flag it for a payments review."],
    };
    const out = kb.validate(article, {}, "INC-0539 RB-21 ENG-5230");
    expect(out.data.steps).toEqual([
      E_COMMERCE.recordOnly.confirmStep,
      "Apply RB-21.",
      E_COMMERCE.recordOnly.reviewStep,
    ]);
  });

  it("the new-ticket check never sends a double charge to RB-21", () => {
    const classify = INCIDENT_STEPS["e-commerce"].classify;
    const text = "Order #52999 stuck in Payment pending; the customer shows two settled charges.";
    expect(classify.fallback({ text, article: ruleKb() })).toMatchObject({
      matches_known_pattern: false,
      escalate: true,
    });
    const model = {
      component: "payments",
      severity: "S2",
      matches_known_pattern: true,
      matched_article: ruleKb().title,
      suggested_action: "Apply RB-21.",
      escalate: false,
      why: "Payment pending.",
    };
    expect(classify.validate(model, { text, article: ruleKb() }).data).toMatchObject({
      matches_known_pattern: false,
      escalate: true,
    });
  });
});

describe("the e-commerce recording", () => {
  it("is what the rules answer with the model off (MOCK=1, no spend), apart from its date and timings", async () => {
    const fresh = await rulesRecording(SHOP_DESK, SHOP_INCIDENT, committed.recordedAt);
    const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x: unknown) => (k === "ms" ? 0 : x))) as unknown;
    expect(strip(fresh)).toEqual(strip(committed));
    expect(committed.source).toBe("rules");
    expect(committed.totalCost).toBe(0);
  });

  it("holds the four RB-21 closures of the pattern and links the double capture", () => {
    const run = SHOP_DESK.recorded();
    const lanes = lanesOf(indexRun(run, SHOP_DESK), SHOP_DESK);
    expect(lanes.held).toEqual(INCIDENT.heldIds);
    for (const id of INCIDENT.openIds.filter((i) => !INCIDENT.heldIds.includes(i)))
      expect(lanes.escalate).toContain(id);
    const summary = shiftSummary(indexRun(run, SHOP_DESK), "t", undefined, SHOP_INCIDENT, SHOP_DESK);
    expect(summary.open_at_start).toBe(22);
    expect(summary.incident.ref).toBe("INC-0539");
    expect(summary.escalated.ref).toBe("ENG-5230");
  });
});

describe("the e-commerce walkthrough", () => {
  const story = rulesStoryData(SHOP_DESK);

  it("tells its own story in every beat, with no EV or SaaS words", () => {
    for (const decisions of [none, all(story)]) {
      const f = facts(story, decisions, SHOP_INCIDENT, SHOP_DESK);
      expect(f.total).toBe(22);
      expect(f.heldRunbook).toBe("RB-21");
      expect(f.prior).toBe(3);
      for (const b of BEATS) {
        const text = `${b.when(f)} | ${b.claim(f)} | ${b.lede(f)}`;
        expect(otherWord(text), b.id).toBeNull();
        expect(b.claim(f).trim(), b.id).not.toBe("");
      }
    }
    const f = facts(story, none, SHOP_INCIDENT, SHOP_DESK);
    const claim = (id: string) => BEATS.find((b) => b.id === id)!.claim(f);
    expect(claim("v3")).toBe("Canary 1 → 0. Control 6 → 7.");
    expect(claim("e4")).toBe("11 of 25 slow first answers became a second authorization.");
  });

  it("says the incident is synthetic and reproduced in a lab", () => {
    expect(SHOP_INCIDENT.logs.lede).toMatch(/^Synthetic/);
    expect(SHOP_INCIDENT.replays.caption).toMatch(/^Synthetic/);
    expect(SHOP_INCIDENT.detector.title).toMatch(/\(synthetic\)/);
    expect(SHOP_INCIDENT.verification.bars.caption).toMatch(/synthetic traffic/);
    expect(ruleKb().title).toBe("Order stuck in Payment pending with a second authorization after a slow checkout");
  });

  it("renders the board at every beat, the desk tabs and the packet with no EV or SaaS words", async () => {
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
        h(IncidentContext.Provider, { value: SHOP_INCIDENT }, h(RunProvider, { pack: SHOP_DESK }, el)),
      );
    const html: string[] = tabs.map((t) => render(h(t)));
    for (const decisions of [none, all(story)]) {
      const f = facts(story, decisions, SHOP_INCIDENT, SHOP_DESK);
      BEATS.forEach((b, at) =>
        html.push(render(h(Board, { at, beat: b.id, data: story, f, onOpenTicket: () => undefined }))),
      );
    }
    html.push(packetMarkdown(story.handoff, SHOP_INCIDENT));
    // The words a visitor reads: tags and their class names (such as tickets-site) are left out.
    html.forEach((page, i) => expect(otherWord(page.replace(/<[^>]*>/g, " ")), `page ${i}`).toBeNull());
    const joined = html.join("\n");
    for (const text of ["INC-0539", "ENG-5230", "SecondAuthorizationReproductionTest", "T-4022", "#51209"])
      expect(joined).toContain(text);
    // No live run for this pack yet: the run controls say so instead of offering one.
    expect(joined).not.toContain("Run it live");
  });
});
