// The repeat rule and the lanes. The rule is the prototype's (prototype/public/desk.js, applyGuardrail):
// a runbook that only corrects records is not applied again once it has already closed tickets in its own
// scope REPEAT_LIMIT or more times in the last WINDOW_DAYS. Those closures are held and read as one pattern.
import { HISTORY, RUNBOOKS, TICKETS, type HistoryItem, type Runbook } from "../data/synthetic";
import { LANES, type Lane, type TriageResult } from "./types";

export const REPEAT_LIMIT = 3;
export const WINDOW_DAYS = 21;

export const runbookById = (id: string): Runbook | undefined => RUNBOOKS.find((r) => r.id === id);

/** Earlier tickets inside the window that this runbook closed. */
export const priorUses = (runbookId: string): HistoryItem[] =>
  HISTORY.filter((h) => h.day >= -WINDOW_DAYS && h.resolution.startsWith(`${runbookId}:`));

/** True when the repeat rule stops a closure with this runbook. */
export function repeatRuleHolds(runbookId: string): boolean {
  return Boolean(runbookById(runbookId)?.recordOnly) && priorUses(runbookId).length >= REPEAT_LIMIT;
}

/** A record-only runbook closes at the last meter value, so a person checks the meter first. */
export const needsMeterCheck = (runbookId: string): boolean => Boolean(runbookById(runbookId)?.recordOnly);

export function laneOf(result: Pick<TriageResult, "action" | "runbook">): Lane {
  switch (result.action) {
    case "close_with_runbook":
      return repeatRuleHolds(result.runbook) ? "held" : "close";
    case "escalation_candidate":
      return "escalate";
    case "info_only":
      return "info";
    default:
      return "person";
  }
}

export const LANE_LABEL: Record<Lane, string> = {
  close: "Close with runbook",
  person: "Needs a person",
  escalate: "Escalation candidate",
  info: "Info only",
  held: "Held",
};

/** Everything the UI says about why a closure is held, computed from the closed history. */
export interface RepeatRule {
  runbook: Runbook;
  uses: HistoryItem[];
  sites: number;
  limit: number;
  windowDays: number;
}

export function repeatRuleFor(runbookId: string): RepeatRule | null {
  const runbook = runbookById(runbookId);
  if (!runbook || !repeatRuleHolds(runbookId)) return null;
  const uses = priorUses(runbookId);
  return {
    runbook,
    uses,
    sites: new Set(uses.map((h) => h.site)).size,
    limit: REPEAT_LIMIT,
    windowDays: WINDOW_DAYS,
  };
}

export type LaneCounts = Record<Lane, number>;

export function emptyLaneCounts(): LaneCounts {
  return Object.fromEntries(LANES.map((l) => [l, 0])) as LaneCounts;
}

/** Ticket ids in queue order, so the order never depends on which batch landed first. */
export const TICKET_ORDER: readonly string[] = TICKETS.map((t) => t.id);
