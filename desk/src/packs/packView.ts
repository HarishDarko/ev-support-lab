// The keyword rules' view of a pack: their triage of its queue, its patterns, the knowledge base article and
// new-ticket check built from them, and the rules' score against the reviewed labels. Pure functions over the pack;
// tests/packs-content.test.ts pins each pack's rules score through it, and the desk's scorecard shows the same score
// from the rules' recorded run (each pack's e2e checks the page).
import { ruleTriageFor, rulePatternsFor, type RuleTriageResult } from "../../functions/_lib/rule-engine";
import { shortChainSteps } from "../../functions/_lib/short-chain";
import { topPattern } from "../../functions/_lib/top-pattern";
import type { Pack, PackHistoryItem, PackTicket } from "../../shared/packs/types";
import { scoreTriage, type ReferenceLabel, type TriageScore } from "../run/score";

export type AnyPack = Pack<string, PackTicket & Record<string, unknown>, PackHistoryItem>;

export const LANE_OF: Record<string, string> = {
  close_with_runbook: "Close with runbook",
  needs_human: "Needs a person",
  escalation_candidate: "Escalate",
  info_only: "Info only",
};

export interface PackView {
  rows: { ticket: AnyPack["tickets"][number]; result: RuleTriageResult; lane: string }[];
  patterns: ReturnType<typeof rulePatternsFor>["patterns"];
  article: ReturnType<ReturnType<typeof shortChainSteps>["kb"]["fallback"]> | null;
  check: ReturnType<ReturnType<typeof shortChainSteps>["classify"]["fallback"]> | null;
  score: { lenient: TriageScore; strict: TriageScore; history: { same: number; n: number } };
}

/** The rules' runbook on each closed ticket against the runbook its real resolution names. */
export function historyCheckOf(pack: AnyPack): { same: number; n: number } {
  let same = 0;
  for (const h of pack.history) {
    const resolved = /^(RB-\d{2})/.exec(h.resolution)?.[1] ?? "none";
    if (ruleTriageFor(pack, h).runbook === resolved) same += 1;
  }
  return { same, n: pack.history.length };
}

export function packView(pack: AnyPack, labels: readonly ReferenceLabel[]): PackView {
  const results = pack.tickets.map((t) => ruleTriageFor(pack, t));
  const patterns = rulePatternsFor(pack).patterns;
  const steps = shortChainSteps(pack);
  const pattern = topPattern(patterns);
  const article = pattern ? steps.kb.fallback({ pattern }) : null;
  const check =
    article && pack.newTicketExample ? steps.classify.fallback({ text: pack.newTicketExample, article }) : null;
  return {
    rows: pack.tickets.map((ticket, i) => ({ ticket, result: results[i]!, lane: LANE_OF[results[i]!.action] ?? "" })),
    patterns,
    article,
    check,
    score: {
      lenient: scoreTriage(labels, results),
      strict: scoreTriage(labels, results, "strict"),
      history: historyCheckOf(pack),
    },
  };
}
