// Golden markup for every screen that reads the incident (SD-15, step 2: a neutral incident engine with no change
// for EV). Recorded on the code before the change and compared byte for byte after it:
//   desk:   the Incident and Handoff tabs, rendered from the committed recorded run;
//   pages:  the operating model and engineering notes pages;
//   board:  the walkthrough board at every beat, from the recorded run and from the rules, before any decision and
//           with every decision made;
//   packet: the engineering packet as Markdown, from the recorded run and from the rules.
// The .tsx modules are loaded by paths the test type-check does not follow (it does not compile JSX); Vitest runs
// the real modules. To record (only on the base commit): GOLDEN_WRITE=1 npx vitest run tests/golden-ui.test.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { recordedRun } from "../src/run/recorded";
import { indexRun } from "../src/run/selectors";
import { rulesStoryData, type StoryData } from "../src/story/data";
import { BEATS, facts, type Decisions } from "../src/story/beats";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "golden", "ui.json");
const WRITE = process.env["GOLDEN_WRITE"] === "1";

type Component = (props: Record<string, unknown>) => unknown;
type Load = (path: string) => Promise<Record<string, unknown>>;
const load: Load = (path) => import(/* @vite-ignore */ path) as Promise<Record<string, unknown>>;

const paths = {
  react: "react",
  server: "react-dom/server",
  run: "../src/run/useRun",
  fromRun: "../src/story/fromRun",
  incident: "../src/desk/incident/IncidentTab",
  handoff: "../src/desk/handoff/HandoffTab",
  packet: "../src/desk/handoff/packetMarkdown",
  operating: "../src/pages/OperatingModel",
  notes: "../src/pages/EngineeringNotes",
  board: "../src/board/Board",
};

describe("golden markup of the incident screens (EV)", () => {
  it("is unchanged", async () => {
    const react = await load(paths.react);
    const h = react["createElement"] as (type: unknown, props?: unknown, ...children: unknown[]) => unknown;
    const { renderToStaticMarkup } = (await load(paths.server)) as { renderToStaticMarkup: (el: unknown) => string };
    const { RunProvider } = (await load(paths.run)) as { RunProvider: Component };
    const { storyDataFromRun } = (await load(paths.fromRun)) as {
      storyDataFromRun: (api: unknown) => StoryData;
    };
    const { IncidentTab } = (await load(paths.incident)) as { IncidentTab: Component };
    const { HandoffTab } = (await load(paths.handoff)) as { HandoffTab: Component };
    const { packetMarkdown } = (await load(paths.packet)) as { packetMarkdown: (h: unknown) => string };
    const { OperatingModel } = (await load(paths.operating)) as { OperatingModel: Component };
    const { EngineeringNotes } = (await load(paths.notes)) as { EngineeringNotes: Component };
    const { Board } = (await load(paths.board)) as { Board: Component };

    const render = (el: unknown) => renderToStaticMarkup(h(RunProvider, null, el));

    const run = recordedRun();
    const index = indexRun(run);
    const recorded = storyDataFromRun({ run, resultFor: (id: string) => index.get(id) });
    const none: Decisions = { approvedIds: [], sent: false, meterChecked: [] };
    const all = (data: StoryData): Decisions => ({
      approvedIds: data.tickets.map((t) => t.id),
      sent: true,
      meterChecked: data.tickets.map((t) => t.id),
    });
    const board = (data: StoryData) =>
      Object.fromEntries(
        [
          ["start", none],
          ["done", all(data)],
        ].flatMap(([name, decisions]) => {
          const f = facts(data, decisions as Decisions);
          return BEATS.map((b, at) => [
            `${name as string}:${b.id}`,
            render(h(Board, { at, beat: b.id, data, f, onOpenTicket: () => undefined })),
          ]);
        }),
      );

    const value = {
      desk: { incident: render(h(IncidentTab)), handoff: render(h(HandoffTab)) },
      pages: { operating: render(h(OperatingModel)), notes: render(h(EngineeringNotes)) },
      board: { recorded: board(recorded), rules: board(rulesStoryData()) },
      packet: { recorded: packetMarkdown(recorded.handoff), rules: packetMarkdown(rulesStoryData().handoff) },
    };

    const text = JSON.stringify(value, null, 1) + "\n";
    if (WRITE) writeFileSync(FILE, text);
    console.log(`golden ui: sha256 ${createHash("sha256").update(text).digest("hex")} (${text.length} chars)`);
    expect(existsSync(FILE), `${FILE} is missing; record it on the base commit`).toBe(true);
    expect(text).toBe(readFileSync(FILE, "utf8"));
  });
});
