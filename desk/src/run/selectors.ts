// Reads over a Run: one result per ticket with its lane and provenance, lane counts, and the shift summary the
// end-of-shift note is written from. Pure functions; the React hook only memoises them.
import { EV_INCIDENT } from "../incident/ev-charging";
import type { Incident } from "../incident/types";
import {
  LANE_LABEL,
  emptyLaneCounts,
  laneOf,
  needsMeterCheck,
  priorUses,
  repeatRuleFor,
  runbookById,
  type LaneCounts,
  type RepeatRule,
} from "./guardrail";
import { EV_DESK, type DeskHistory, type DeskPack, type DeskRunbook, type DeskTicket } from "./pack";
import { provenanceOf, type Provenance } from "./provenance";
import type { Lane, Run, StepResult, TriageData, TriageResult } from "./types";

/** Everything the desk shows about one ticket's triage. */
export interface TicketResult {
  ticket: DeskTicket;
  result: TriageResult;
  lane: Lane;
  laneLabel: string;
  provenance: Provenance;
  /** The runbook the result names, if it names a real one. */
  runbook: DeskRunbook | null;
  /** The quoted words, when they were verified in the ticket text. Null otherwise: nothing is highlighted. */
  quote: string | null;
  /** For a rules result: the words the rule matched in the ticket. Not AI output, so it is marked differently. */
  matched: string | null;
  /** Set for a held closure: the repeat rule and the earlier closures behind it. */
  repeatRule: RepeatRule | null;
  /** Earlier closures by the same runbook in the window (the history behind the rule). */
  priorUses: DeskHistory[];
  needsMeterCheck: boolean;
}

export type TicketIndex = ReadonlyMap<string, TicketResult>;

export function indexRun(run: Run, pack: DeskPack = EV_DESK): TicketIndex {
  return indexTriage(run.steps.triage, pack);
}

export function indexTriage(batches: readonly StepResult<TriageData>[], pack: DeskPack = EV_DESK): TicketIndex {
  const index = new Map<string, TicketResult>();
  const byId = new Map(pack.tickets.map((t) => [t.id, t]));
  for (const batch of batches) {
    for (const result of batch.data.results) {
      const ticket = byId.get(result.id);
      if (!ticket) continue;
      const lane = laneOf(result, pack);
      index.set(result.id, {
        ticket,
        result,
        lane,
        laneLabel: LANE_LABEL[lane],
        provenance: provenanceOf(result.source, batch.trace, batch.ms, Boolean(batch.live)),
        runbook: runbookById(result.runbook, pack) ?? null,
        quote: result.source === "ai" && result.quote_verified && result.evidence ? result.evidence : null,
        matched: result.source === "rules" && result.evidence ? result.evidence : null,
        repeatRule: lane === "held" ? repeatRuleFor(result.runbook, pack) : null,
        priorUses: result.runbook === "none" ? [] : priorUses(result.runbook, pack),
        needsMeterCheck: needsMeterCheck(result.runbook, pack),
      });
    }
  }
  return index;
}

/** Ticket ids per lane, in queue order. */
export function lanesOf(index: TicketIndex, pack: DeskPack = EV_DESK): Record<Lane, string[]> {
  const lanes: Record<Lane, string[]> = { close: [], person: [], escalate: [], info: [], held: [] };
  for (const t of pack.tickets) {
    const entry = index.get(t.id);
    if (entry) lanes[entry.lane].push(t.id);
  }
  return lanes;
}

export function laneCounts(index: TicketIndex): LaneCounts {
  const counts = emptyLaneCounts();
  for (const entry of index.values()) counts[entry.lane] += 1;
  return counts;
}

/** How many of the triaged tickets each side decided. */
export function originCounts(index: TicketIndex): { ai: number; rules: number } {
  let ai = 0;
  for (const entry of index.values()) if (entry.result.source === "ai") ai += 1;
  return { ai, rules: index.size - ai };
}

/**
 * The summary the end-of-shift note is written from (same fields as the prototype).
 * `approved` is the number of closures a person approved. The recording assumes the shift approved every
 * closure in the close lane, which is the number the story ends on.
 */
export function shiftSummary(
  index: TicketIndex,
  handoffTitle: string,
  approved?: number,
  incident: Incident = EV_INCIDENT,
  pack: DeskPack = EV_DESK,
) {
  const lanes = lanesOf(index, pack);
  const closing = approved ?? lanes.close.length;
  return {
    open_at_start: pack.tickets.length,
    approved_for_closure: closing,
    held_by_repeat_guardrail: lanes.held,
    still_open: pack.tickets.length - closing,
    needs_a_person: lanes.person.map((id) => `${id}: ${index.get(id)!.result.summary}`),
    ai_agreement: {
      triaged: index.size,
      changed_by_person: 0,
      decided_by_rules_fallback: originCounts(index).rules,
    },
    // The incident is where support contains the problem; the engineering ticket is where the fix is asked for.
    incident: { ref: incident.id, held_tickets: incident.openIds },
    escalated: { ref: incident.change.ref, title: handoffTitle, workaround: incident.containment.lines },
    kb_article_published: false,
  };
}
