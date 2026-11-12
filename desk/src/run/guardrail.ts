// The repeat rule and the lanes. The rule is the prototype's (prototype/public/desk.js, applyGuardrail):
// a runbook that only corrects records is not applied again once it has already closed tickets in its own
// scope REPEAT_LIMIT or more times in the last WINDOW_DAYS. Those closures are held and read as one pattern.
// Every read takes the pack it is about; with none it reads the default pack (EV charging).
import { EV_DESK, type DeskHistory, type DeskPack, type DeskRunbook } from "./pack";
import { LANES, type Lane, type TriageResult } from "./types";

export const REPEAT_LIMIT = 3;
export const WINDOW_DAYS = 21;

export const runbookById = (id: string, pack: DeskPack = EV_DESK): DeskRunbook | undefined =>
  pack.runbooks.find((r) => r.id === id);

/** Earlier tickets inside the window that this runbook closed. */
export const priorUses = (runbookId: string, pack: DeskPack = EV_DESK): DeskHistory[] =>
  pack.history.filter((h) => h.day >= -WINDOW_DAYS && h.resolution.startsWith(`${runbookId}:`));

/** True when the repeat rule stops a closure with this runbook. */
export function repeatRuleHolds(runbookId: string, pack: DeskPack = EV_DESK): boolean {
  return Boolean(runbookById(runbookId, pack)?.recordOnly) && priorUses(runbookId, pack).length >= REPEAT_LIMIT;
}

/** A record-only runbook only corrects the record, so a person checks first (for EV: the meter). */
export const needsMeterCheck = (runbookId: string, pack: DeskPack = EV_DESK): boolean =>
  Boolean(runbookById(runbookId, pack)?.recordOnly);

export function laneOf(result: Pick<TriageResult, "action" | "runbook">, pack: DeskPack = EV_DESK): Lane {
  switch (result.action) {
    case "close_with_runbook":
      return repeatRuleHolds(result.runbook, pack) ? "held" : "close";
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
  runbook: DeskRunbook;
  uses: DeskHistory[];
  /** The places those closures came from (for EV: sites). */
  sites: number;
  limit: number;
  windowDays: number;
}

export function repeatRuleFor(runbookId: string, pack: DeskPack = EV_DESK): RepeatRule | null {
  const runbook = runbookById(runbookId, pack);
  if (!runbook || !repeatRuleHolds(runbookId, pack)) return null;
  const uses = priorUses(runbookId, pack);
  return {
    runbook,
    uses,
    sites: new Set(uses.map((h) => pack.placeOf(h))).size,
    limit: REPEAT_LIMIT,
    windowDays: WINDOW_DAYS,
  };
}

export type LaneCounts = Record<Lane, number>;

export function emptyLaneCounts(): LaneCounts {
  return Object.fromEntries(LANES.map((l) => [l, 0])) as LaneCounts;
}

/** Ticket ids in queue order, so the order never depends on which batch landed first. */
export const ticketOrder = (pack: DeskPack = EV_DESK): readonly string[] => pack.tickets.map((t) => t.id);
export const TICKET_ORDER: readonly string[] = ticketOrder();
