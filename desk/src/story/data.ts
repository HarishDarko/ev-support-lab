// What the story needs from a run, in one shape. The run model (src/run) supplies it from a recorded
// or live run; rulesStoryData() builds the same shape from the deterministic rules, so the story
// always has something true to show.
import {
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleTriage,
  ruleVerify,
} from "../../functions/_lib/rules";
import type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  ShiftnoteModel,
  VerifyModel,
} from "../../functions/_lib/steps";
import { HISTORY, NEW_TICKET_EXAMPLE, RUNBOOKS, TICKETS } from "../data/synthetic";

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
// again once it has closed tickets in its own scope REPEAT_LIMIT or more times in WINDOW_DAYS.
export const REPEAT_LIMIT = 3;
export const WINDOW_DAYS = 21;

export const priorUses = (runbook: string) =>
  HISTORY.filter((h) => h.day >= -WINDOW_DAYS && h.resolution.startsWith(`${runbook}:`));

const RECORD_ONLY = new Set(RUNBOOKS.filter((r) => r.recordOnly).map((r) => r.id));

export function laneFor(action: string, runbook: string): Lane {
  if (action === "close_with_runbook")
    return RECORD_ONLY.has(runbook) && priorUses(runbook).length >= REPEAT_LIMIT ? "held" : "close";
  if (action === "escalation_candidate") return "escalate";
  if (action === "info_only") return "info";
  return "person";
}

export function rulesStoryData(): StoryData {
  const tickets = TICKETS.map((t) => {
    const r = ruleTriage(t);
    return {
      id: t.id,
      lane: laneFor(r.action, r.runbook),
      runbook: r.runbook,
      quote: r.evidence,
      provenance: "rules" as const,
    };
  });
  const kb = ruleKb();
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
    investigation: ruleInvestigate(),
    handoff: ruleHandoff(),
    verify: ruleVerify(),
    kb,
    classify: ruleClassify(NEW_TICKET_EXAMPLE, kb),
    shiftnote: ruleShiftnote({
      open_at_start: TICKETS.length,
      approved_for_closure: approved,
      needs_a_person: tickets.filter((t) => t.lane === "person").map((t) => t.id),
    }),
  };
}
