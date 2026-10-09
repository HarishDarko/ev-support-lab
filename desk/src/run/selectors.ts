// Reads over a Run: one result per ticket with its lane and provenance, lane counts, and the shift summary the
// end-of-shift note is written from. Pure functions; the React hook only memoises them.
import { ENGINEERING_CHANGE, HERO, TICKETS, type HistoryItem, type Runbook, type Ticket } from "../data/synthetic";
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
import { provenanceOf, type Provenance } from "./provenance";
import type { Lane, Run, StepResult, TriageData, TriageResult } from "./types";

/** Everything the desk shows about one ticket's triage. */
export interface TicketResult {
  ticket: Ticket;
  result: TriageResult;
  lane: Lane;
  laneLabel: string;
  provenance: Provenance;
  /** The runbook the result names, if it names a real one. */
  runbook: Runbook | null;
  /** The quoted words, when they were verified in the ticket text. Null otherwise: nothing is highlighted. */
  quote: string | null;
  /** For a rules result: the words the rule matched in the ticket. Not AI output, so it is marked differently. */
  matched: string | null;
  /** Set for a held closure: the repeat rule and the earlier closures behind it. */
  repeatRule: RepeatRule | null;
  /** Earlier closures by the same runbook in the window (the history behind the rule). */
  priorUses: HistoryItem[];
  needsMeterCheck: boolean;
}

export type TicketIndex = ReadonlyMap<string, TicketResult>;

export function indexRun(run: Run): TicketIndex {
  return indexTriage(run.steps.triage);
}

export function indexTriage(batches: readonly StepResult<TriageData>[]): TicketIndex {
  const index = new Map<string, TicketResult>();
  const byId = new Map(TICKETS.map((t) => [t.id, t]));
  for (const batch of batches) {
    for (const result of batch.data.results) {
      const ticket = byId.get(result.id);
      if (!ticket) continue;
      const lane = laneOf(result);
      index.set(result.id, {
        ticket,
        result,
        lane,
        laneLabel: LANE_LABEL[lane],
        provenance: provenanceOf(result.source, batch.trace, batch.ms, Boolean(batch.live)),
        runbook: runbookById(result.runbook) ?? null,
        quote: result.source === "ai" && result.quote_verified && result.evidence ? result.evidence : null,
        matched: result.source === "rules" && result.evidence ? result.evidence : null,
        repeatRule: lane === "held" ? repeatRuleFor(result.runbook) : null,
        priorUses: result.runbook === "none" ? [] : priorUses(result.runbook),
        needsMeterCheck: needsMeterCheck(result.runbook),
      });
    }
  }
  return index;
}

/** Ticket ids per lane, in queue order. */
export function lanesOf(index: TicketIndex): Record<Lane, string[]> {
  const lanes: Record<Lane, string[]> = { close: [], person: [], escalate: [], info: [], held: [] };
  for (const t of TICKETS) {
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
export function shiftSummary(index: TicketIndex, handoffTitle: string, approved?: number) {
  const lanes = lanesOf(index);
  const closing = approved ?? lanes.close.length;
  return {
    open_at_start: TICKETS.length,
    approved_for_closure: closing,
    held_by_repeat_guardrail: lanes.held,
    still_open: TICKETS.length - closing,
    needs_a_person: lanes.person.map((id) => `${id}: ${index.get(id)!.result.summary}`),
    ai_agreement: {
      triaged: index.size,
      changed_by_person: 0,
      decided_by_rules_fallback: originCounts(index).rules,
    },
    // The incident is where support contains the problem; the engineering ticket is where the fix is asked for.
    incident: { ref: HERO.incidentId, held_tickets: HERO.openIds },
    escalated: { ref: ENGINEERING_CHANGE.ref, title: handoffTitle, workaround: HERO.supportNow },
    kb_article_published: false,
  };
}
