// Reads the story's view of a run from the run model (recorded or live). Provenance is per step, so a live run
// where one step fell back to the rules says so on that step only.
import { originOf, type RunApi } from "../run";
import type { StoryData, TicketView } from "./data";

export function storyDataFromRun(api: Pick<RunApi, "run" | "resultFor">): StoryData {
  const { run } = api;
  const s = run.steps;
  const tickets: TicketView[] = s.triage
    .flatMap((batch) => batch.data.results)
    .map((r) => {
      const t = api.resultFor(r.id);
      return {
        id: r.id,
        lane: t?.lane ?? "person",
        runbook: r.runbook,
        quote: t?.quote ?? t?.matched ?? "",
        provenance: r.source,
      };
    });
  const source: StoryData["source"] =
    run.source === "live" ? "live" : run.recording.source === "ai" ? "recorded-ai" : "recorded-rules";
  return {
    source,
    origins: {
      investigate: originOf(s.investigate.trace),
      handoff: originOf(s.handoff.trace),
      verify: originOf(s.verify.trace),
      kb: originOf(s.kb.trace),
      classify: originOf(s.classify.trace),
      shiftnote: originOf(s.shiftnote.trace),
    },
    tickets,
    investigation: s.investigate.data,
    handoff: s.handoff.data,
    verify: s.verify.data,
    kb: s.kb.data,
    classify: s.classify.data,
    shiftnote: s.shiftnote.data,
  };
}
