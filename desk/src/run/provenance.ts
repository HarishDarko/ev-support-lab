// Where an AI-produced item came from: which model, whether the answer passed its checks or the rules decided,
// and what the checks cover. Every AI item on screen carries one of these.
import { formatUsd } from "./format";
import { originOf, type Check, type Origin, type StepKey, type StepResult, type Trace } from "./types";

export type Reliability = "high" | "medium" | "low";

export interface Provenance {
  origin: Origin;
  /** The label shown next to the item. */
  label: "AI, checked" | "Rules fallback";
  model: string;
  reliability: Reliability | null;
  /** One sentence on what the reliability means. */
  reliabilityNote: string;
  checks: Check[];
  failedChecks: number;
  attempts: number;
  tokens: { input: number; output: number };
  cost: number;
  /** A call ran on a model with no list price, so the cost is a floor. */
  unpriced: boolean;
  ms: number;
  /** True for an answer from a live call in this visit, false for the committed recording. */
  live: boolean;
  /** Why the rules decided instead of the model, when they did. */
  fallbackReason: string | null;
}

const RELIABILITY_NOTE: Record<Reliability, string> = {
  high: "Every check passed.",
  medium: "The answer was kept, with a check flagged.",
  low: "The rules decided; the live result was not used.",
};

/** What each step's checks cover, and what is left to a person. */
export const CHECK_SCOPE: Record<StepKey, { checked: string; notChecked: string }> = {
  triage: {
    checked:
      "the quote is in the ticket, the label and runbook fit the ticket, every closure names a runbook, runbook exceptions",
    notChecked: "severity and confidence",
  },
  patterns: { checked: "ticket ids exist", notChecked: "whether the grouping is right" },
  investigate: {
    checked: "each quote is in the source it cites, ids exist, numbers appear in the input",
    notChecked: "the reasoning and the ranking of the hypotheses",
  },
  handoff: {
    checked: "an ask and escalation rules are present, ids exist, numbers appear in the input",
    notChecked: "the reproduction steps",
  },
  verify: { checked: "ids exist, numbers appear in the input", notChecked: "the verdict itself" },
  kb: { checked: "ids exist, numbers appear in the input", notChecked: "the steps and escalation conditions" },
  shiftnote: {
    checked: "ids exist, numbers appear in the input",
    notChecked: "what the note chooses to include",
  },
  classify: {
    checked: "the article title is real, the wording of three named exceptions to the pattern",
    notChecked: "whether the meter is flat (a person checks before RB-05), severity, anything else in the article",
  },
};

/**
 * `origin` is passed separately because one triage batch can mix both: the trace describes the batch,
 * each ticket records who decided it.
 */
export function provenanceOf(origin: Origin, trace: Trace, ms: number, live = false): Provenance {
  const reliability = trace.reliability === "high" || trace.reliability === "medium" ? trace.reliability : null;
  const rules = origin === "rules";
  return {
    origin,
    label: rules ? "Rules fallback" : "AI, checked",
    model: rules ? "deterministic rules" : trace.model,
    reliability: rules ? "low" : reliability,
    reliabilityNote: rules ? RELIABILITY_NOTE.low : reliability ? RELIABILITY_NOTE[reliability] : "",
    checks: trace.checks,
    failedChecks: trace.checks.filter((c) => !c.passed).length,
    attempts: trace.attempts,
    tokens: trace.tokens,
    cost: trace.cost,
    unpriced: Boolean(trace.unpriced),
    ms,
    live,
    fallbackReason: trace.fallbackReason ?? null,
  };
}

/** The provenance of a whole step: it was produced by whoever its trace says. */
export const provenanceOfStep = (result: StepResult<unknown>): Provenance =>
  provenanceOf(originOf(result.trace), result.trace, result.ms, Boolean(result.live));

/** "$0.0123", with a plus when some call had no list price. */
export const costText = (p: Pick<Provenance, "cost" | "unpriced">): string =>
  p.unpriced ? `${formatUsd(p.cost)} +` : formatUsd(p.cost);
