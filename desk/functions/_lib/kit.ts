// What every step is made of: the shape the handler needs, JSON schema helpers, and the grounding check shared by
// the reasoning steps. Neutral: no industry content here.
import { ValidationError, check, ungroundedNumbers } from "./checks";
import type { Severity, TriageAction } from "../../shared/packs/types";
import type { Check, JsonSchema, StepInput } from "./types";

/** What the handler needs from a step. Each step narrows `validate`'s data to its own output shape. */
export interface Step {
  deep: boolean;
  maxTokens?: number;
  schema: JsonSchema;
  build(input: StepInput): string;
  validate(data: unknown, input: StepInput, prompt: string): { data: unknown; checks: Check[] };
  fallback(input: StepInput): unknown;
}

export const obj = (properties: Record<string, unknown>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const str = { type: "string" };
export const strs = { type: "array", items: str };
export const bool = { type: "boolean" };
export const SEVERITIES = ["S1", "S2", "S3", "S4"] as const satisfies readonly Severity[];
export const severity = { type: "string", enum: [...SEVERITIES] };
/** The actions triage may give a ticket. */
export const TRIAGE_ACTIONS = [
  "close_with_runbook",
  "needs_human",
  "escalation_candidate",
  "info_only",
] as const satisfies readonly TriageAction[];

/** Every id a step may cite: the pack's tickets, history, runbooks and its extra ids. */
export function knownIds(pack: {
  tickets: { id: string }[];
  history: { id: string }[];
  runbooks: { id: string }[];
  extraIds: string[];
}): Set<string> {
  return new Set<string>([
    ...pack.tickets.map((t) => t.id),
    ...pack.history.map((h) => h.id),
    ...pack.runbooks.map((r) => r.id),
    ...pack.extraIds,
  ]);
}

/** The runbooks as the prompts list them. */
export const runbookListOf = (runbooks: { id: string; title: string; scope: string }[]): string =>
  runbooks.map((r) => `${r.id}: ${r.title} (use when: ${r.scope})`).join("\n");

// Shared checks for reasoning steps: unknown ids are an error, derived numbers are a warning.
export function groundingIn(known: Set<string>) {
  return function grounding(data: unknown, prompt: string): Check[] {
    const ids = JSON.stringify(data).match(/\b(?:T-\d{4}|H-\d{4}|RB-\d{2}|ENG-\d{4}|INC-\d{4})\b/g) ?? [];
    const unknown = [...new Set(ids)].filter((id) => !known.has(id));
    if (unknown.length) throw new ValidationError(`Referenced unknown ids: ${unknown.join(", ")}`);
    const numbers = ungroundedNumbers(data, prompt);
    return [
      check("Ids exist in the data", true, `${new Set(ids).size} referenced`),
      check(
        "Numbers come from the input",
        numbers.length === 0,
        numbers.length ? `derived or unmatched: ${numbers.slice(0, 4).join(", ")}` : "all matched",
      ),
    ];
  };
}
