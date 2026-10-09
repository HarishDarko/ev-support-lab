// Cost and labels for a run, computed from the traces. Nothing here is typed in: a rules-only run costs $0
// because its traces say so.
import { formatUsdShort } from "./format";
import { STEP_KEYS, type Run, type RunSteps, type StepKey, type StepResult, type Trace } from "./types";

export const STEP_LABEL: Record<StepKey, string> = {
  triage: "Triage",
  patterns: "Patterns",
  investigate: "Investigation",
  handoff: "Handoff packet",
  verify: "Verification reading",
  kb: "Knowledge base article",
  shiftnote: "End-of-shift note",
  classify: "New-ticket check",
};

/** Every step's results as a flat list: triage contributes one per batch. */
export function resultsOf<K extends StepKey>(steps: RunSteps, key: K): StepResult<unknown>[] {
  const value = steps[key];
  return Array.isArray(value) ? value : [value];
}

export interface StepCost {
  step: StepKey;
  label: string;
  /** API calls behind the step (triage is one per batch). */
  calls: number;
  /** Calls the model answered, as opposed to the rules. */
  aiCalls: number;
  models: string[];
  tokens: { input: number; output: number };
  cost: number;
  unpriced: boolean;
  /** Time spent. Triage batches run in parallel, so this is the slowest batch, not the sum. */
  ms: number;
}

function sum(traces: Trace[]) {
  const total = { cost: 0, unpriced: false, tokens: { input: 0, output: 0 } };
  for (const t of traces) {
    total.cost += t.cost;
    total.unpriced ||= Boolean(t.unpriced);
    total.tokens.input += t.tokens.input;
    total.tokens.output += t.tokens.output;
  }
  return total;
}

export function costByStep(steps: RunSteps): StepCost[] {
  return STEP_KEYS.map((step) => {
    const results = resultsOf(steps, step);
    const traces = results.map((r) => r.trace);
    const ai = traces.filter((t) => t.source === "ai");
    return {
      step,
      label: STEP_LABEL[step],
      calls: results.length,
      aiCalls: ai.length,
      models: [...new Set(ai.map((t) => t.model))],
      ...sum(traces),
      ms: Math.max(...results.map((r) => r.ms)),
    };
  });
}

export const runCost = (steps: RunSteps): number => costByStep(steps).reduce((total, s) => total + s.cost, 0);

/** Distinct model ids that produced at least one AI result. */
export function modelsOf(steps: RunSteps): string[] {
  return [
    ...new Set(
      STEP_KEYS.flatMap((k) => resultsOf(steps, k)).flatMap((r) => (r.trace.source === "ai" ? [r.trace.model] : [])),
    ),
  ];
}

/** One line saying what the run is, so a rules-only recording can never pass for an AI one. */
export function runLabel(run: Run): string {
  if (run.source === "live") return "Live run";
  const { source, recordedAt, models } = run.recording;
  const date = recordedAt.slice(0, 10);
  return source === "rules"
    ? `Recorded run, rules only (no model was called), ${date}`
    : `Recorded run, AI (${models.join(", ")}), ${date}`;
}

/** "Live · $0.04 so far", as the top strip shows it. */
/** "Live · $0.04 so far", with a plus when some call had no list price (the figure is then a floor). */
export const liveSpendText = (spent: number, unpriced = false): string =>
  `Live · ${formatUsdShort(spent)}${unpriced ? "+" : ""} so far`;
