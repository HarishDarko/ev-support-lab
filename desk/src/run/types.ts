// The Run model: one object that holds every AI-produced result the desk shows, from the recorded run or a live one.
// The model output types come from the Pages Functions, so the browser and the server cannot drift apart.
import type { Check, Usage } from "../../functions/_lib/types";
import type { Trace } from "../../functions/api/[step]";
import type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  PatternModel,
  ShiftnoteModel,
  TriageModelResult,
  VerifyModel,
} from "../../functions/_lib/steps";

export type { Check, Usage, Trace };
export type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  PatternModel,
  ShiftnoteModel,
  TriageModelResult,
  VerifyModel,
};

/** Who produced a result: the live model after its checks, or the deterministic rules. */
export type Origin = "ai" | "rules";

/** The API types a trace's source as a string; it is always one of the two origins. */
export const originOf = (trace: Pick<Trace, "source">): Origin => (trace.source === "ai" ? "ai" : "rules");

/** A triage result as the API returns it: the model's fields plus what the validator added. */
export interface TriageResult extends TriageModelResult {
  source: Origin;
  /** True when the quote was found word for word in the ticket. Only then is it highlighted. */
  quote_verified: boolean;
  support?: "strong" | "weak";
  /** Set when a closure was moved to "needs a person" because a runbook exception applied. */
  precondition?: string;
  /** Why the rules decided instead of the model. */
  fallback_reason?: string;
  rejected_quote?: string;
}

export interface TriageData {
  results: TriageResult[];
}
export interface PatternsData {
  patterns: PatternModel[];
}

/** What each step returns in `data`. */
export interface StepData {
  triage: TriageData;
  patterns: PatternsData;
  investigate: InvestigationModel;
  handoff: HandoffModel;
  verify: VerifyModel;
  kb: KbModel;
  shiftnote: ShiftnoteModel;
  classify: ClassifyModel;
}
export type StepKey = keyof StepData;

/** The order the chain runs in, and the order the scorecard lists the steps. */
export const STEP_KEYS: readonly StepKey[] = [
  "triage",
  "patterns",
  "investigate",
  "handoff",
  "verify",
  "kb",
  "shiftnote",
  "classify",
];

/** One API answer, stored exactly as the API returned it. */
export interface StepResult<T> {
  data: T;
  trace: Trace;
  ms: number;
  /** Set when this answer came from a live call in this visit; absent for the committed recording. */
  live?: boolean;
}

/** Every step's answer. Triage is a list: one entry per batch of tickets, as the prototype sent them. */
export type RunSteps = { [K in Exclude<StepKey, "triage">]: StepResult<StepData[K]> } & {
  triage: StepResult<TriageData>[];
};

/** The committed file written by `npm run record`. */
export interface RecordedRun {
  recordedAt: string;
  /** "rules" when recorded with MOCK=1 (no model was called), "ai" when a model answered. */
  source: Origin;
  /** Distinct model ids that produced at least one AI result. Empty for a rules-only run. */
  models: string[];
  /** Estimated list-price cost of the whole recording, in USD. */
  totalCost: number;
  steps: RunSteps;
}

export type RunSource = "recorded" | "live";

/** What the desk and the story read. */
export interface Run {
  /** `recorded` until at least one live result has been merged in. */
  source: RunSource;
  recording: Pick<RecordedRun, "recordedAt" | "source" | "models" | "totalCost">;
  steps: RunSteps;
}

/** The lanes tickets sort into at triage. `held` is a closure stopped by the repeat rule. */
export type Lane = "close" | "person" | "escalate" | "info" | "held";
export const LANES: readonly Lane[] = ["close", "person", "escalate", "info", "held"];

export type RunStatus = "idle" | "running" | "done" | "failed";
