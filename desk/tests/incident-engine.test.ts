// SD-15 step 2: the incident screens and beats read whichever incident they are given, not EV's data. A stub
// incident (EV's, with its id, name, breakdown, timing and beat texts replaced) must show up everywhere EV's would,
// and nothing of EV's replaced parts may leak through. The .tsx modules are loaded by paths the test type-check does
// not follow (it does not compile JSX); Vitest runs the real modules.
import { describe, it, expect } from "vitest";
import { EV_INCIDENT } from "../src/incident/ev-charging";
import type { Incident } from "../src/incident/types";
import { recordedRun } from "../src/run/recorded";
import { indexRun, shiftSummary } from "../src/run/selectors";
import { rulesStoryData } from "../src/story/data";
import { BEATS, canaryOutcome, facts, type Decisions } from "../src/story/beats";
import { packetMarkdown } from "../src/desk/handoff/packetMarkdown";

type Component = (props: Record<string, unknown>) => unknown;
const load = (path: string) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

const beat = (id: string) => ({ claim: () => `stub ${id} claim`, lede: () => `stub ${id} lede` });

const STUB: Incident = {
  ...EV_INCIDENT,
  packId: "stub",
  id: "INC-9999",
  name: "Stub incident for the engine test",
  openIds: ["T-9001", "T-9002"],
  historyIds: ["H-9101"],
  breakdown: {
    title: "Stub breakdown",
    lede: "Stub breakdown lede.",
    caption: "Stub caption",
    columns: [{ label: "Auth" }, { label: "Endpoints", num: true }],
    rows: [
      {
        key: "hmac",
        cells: [
          { text: "HMAC", mono: true },
          { text: "2,880", num: true },
        ],
      },
    ],
  },
  timing: {
    ...EV_INCIDENT.timing,
    title: "Stub timing",
    idLabel: "Storm",
    rows: [{ id: "T-9001", group: "oauth", value: 41 }],
  },
  change: { ...EV_INCIDENT.change, ref: "ENG-9999" },
  canaryOutcome: () => "on the stub canary, nothing stuck",
  beats: Object.fromEntries(Object.keys(EV_INCIDENT.beats).map((id) => [id, beat(id)])) as unknown as Incident["beats"],
};

const none: Decisions = { approvedIds: [], sent: false, meterChecked: [] };

describe("the neutral incident engine", () => {
  it("takes every incident beat's text from the incident it is given, and leaves the queue beats alone", () => {
    const f = facts(rulesStoryData(), none, STUB);
    expect(f.incident).toBe(STUB);
    for (const b of BEATS) {
      if (b.id in STUB.beats) {
        expect(b.claim(f)).toBe(`stub ${b.id} claim`);
        expect(b.lede(f)).toBe(`stub ${b.id} lede`);
      } else {
        expect(b.claim(f)).toBe(b.claim(facts(rulesStoryData(), none)));
      }
    }
    expect(canaryOutcome(f)).toBe("on the stub canary, nothing stuck");
    expect(f.shippedDay).toBe(STUB.change.shippedDay);
  });

  it("writes the packet and the shift summary from the incident it is given", () => {
    const run = recordedRun();
    const md = packetMarkdown(run.steps.handoff.data, STUB);
    expect(md).toContain("T-9001, T-9002, H-9101");
    const summary = shiftSummary(indexRun(run), "title", undefined, STUB);
    expect(summary.incident).toEqual({ ref: "INC-9999", held_tickets: ["T-9001", "T-9002"] });
    expect(summary.escalated.ref).toBe("ENG-9999");
  });

  it("renders the Incident tab from the incident in context, with none of EV's replaced parts", async () => {
    const h = (await load("react"))["createElement"] as (type: unknown, props?: unknown, ...c: unknown[]) => unknown;
    const { renderToStaticMarkup } = (await load("react-dom/server")) as {
      renderToStaticMarkup: (el: unknown) => string;
    };
    const { RunProvider } = (await load("../src/run/useRun")) as { RunProvider: Component };
    const { IncidentContext } = (await load("../src/incident")) as { IncidentContext: { Provider: unknown } };
    const { IncidentTab } = (await load("../src/desk/incident/IncidentTab")) as { IncidentTab: Component };
    const html = renderToStaticMarkup(
      h(RunProvider, null, h(IncidentContext.Provider, { value: STUB }, h(IncidentTab))),
    );
    for (const text of [
      "INC-9999",
      "Stub incident for the engine test",
      "Stub breakdown",
      "HMAC",
      "Stub timing",
      "Storm",
      "ENG-9999",
    ])
      expect(html).toContain(text);
    for (const text of ["INC-0412", "Fleet view, last", "Seconds from unplug", "ENG-4471"])
      expect(html).not.toContain(text);
  });
});
