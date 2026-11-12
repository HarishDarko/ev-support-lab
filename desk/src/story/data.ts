// What the story needs from a run, in one shape. The run model (src/run) supplies it from a recorded
// or live run; rulesStoryData() builds the same shape from a pack's deterministic rules (EV charging unless told
// otherwise), so the story always has something true to show.
import { REPEAT_LIMIT, WINDOW_DAYS, priorUses, repeatRuleHolds } from "../run/guardrail";
import { EV_DESK, type DeskPack } from "../run/pack";
import type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  ShiftnoteModel,
  VerifyModel,
} from "../../functions/_lib/steps";

export type Lane = "close" | "person" | "escalate" | "info" | "held";
export type Provenance = "ai" | "rules";

export interface TicketView {
  id: string;
  lane: Lane;
  runbook: string;
  /** The words in the ticket the decision rests on. */
  quote: string;
  provenance: Provenance;
}

export interface StoryData {
  source: "recorded-ai" | "recorded-rules" | "live" | "rules";
  /** Who produced each step's answer: a model, or the rules. */
  origins: Record<"investigate" | "handoff" | "verify" | "kb" | "classify" | "shiftnote", Provenance>;
  tickets: TicketView[];
  investigation: InvestigationModel;
  handoff: HandoffModel;
  verify: VerifyModel;
  kb: KbModel;
  classify: ClassifyModel;
  shiftnote: ShiftnoteModel;
}

// The repeat rule (same values as the prototype and the triage prompt): a record-only runbook is not applied
// again once it has closed tickets in its own scope REPEAT_LIMIT or more times in WINDOW_DAYS. It lives in the run
// model's guardrail; the story reads the same one.
export { REPEAT_LIMIT, WINDOW_DAYS, priorUses };

export function laneFor(action: string, runbook: string, pack: DeskPack = EV_DESK): Lane {
  if (action === "close_with_runbook") return repeatRuleHolds(runbook, pack) ? "held" : "close";
  if (action === "escalation_candidate") return "escalate";
  if (action === "info_only") return "info";
  return "person";
}

export function rulesStoryData(pack: DeskPack = EV_DESK): StoryData {
  const rules = pack.fallbacks;
  const tickets = pack.tickets.map((t) => {
    const r = pack.ruleTriage(t);
    return {
      id: t.id,
      lane: laneFor(r.action, r.runbook, pack),
      runbook: r.runbook,
      quote: r.evidence,
      provenance: "rules" as const,
    };
  });
  const kb = rules.kb();
  const approved = tickets.filter((t) => t.lane === "close").length;
  return {
    source: "rules",
    origins: {
      investigate: "rules",
      handoff: "rules",
      verify: "rules",
      kb: "rules",
      classify: "rules",
      shiftnote: "rules",
    },
    tickets,
    investigation: rules.investigate(),
    handoff: rules.handoff(),
    verify: rules.verify(),
    kb,
    classify: pack.ruleClassify(pack.newTicketExample, kb),
    shiftnote: rules.shiftnote({
      open_at_start: pack.tickets.length,
      approved_for_closure: approved,
      needs_a_person: tickets.filter((t) => t.lane === "person").map((t) => t.id),
    }),
  };
}
