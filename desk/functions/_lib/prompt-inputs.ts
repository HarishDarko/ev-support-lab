// Client-supplied JSON that goes back into a prompt: an earlier step's output (the investigation, the handoff), the
// knowledge base article a new ticket is checked against, and the shift summary. The client could send anything, so
// each value is reduced to the fields that step can really produce. Every field has a type, a length cap for text and
// an item cap for lists; any other field is dropped, and a value of the wrong type or over a cap is refused with a
// 400. What is left goes into the prompt inside a triple-quote fence, marked as data. Neutral: no industry content.
import { StepError, clip } from "./errors";
import { SEVERITIES } from "./kit";

export type Field =
  | { kind: "text"; max: number; values?: readonly string[] }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "list"; of: Field; max: number }
  | { kind: "object"; fields: Record<string, Field> };

export const text = (max: number, values?: readonly string[]): Field =>
  values ? { kind: "text", max, values } : { kind: "text", max };
export const num: Field = { kind: "number" };
export const flag: Field = { kind: "boolean" };
export const list = (of: Field, max: number): Field => ({ kind: "list", of, max });
export const record = (fields: Record<string, Field>): Field => ({ kind: "object", fields });

function refuse(path: string, why: string): never {
  throw new StepError(`${path} ${why}.`, 400);
}

/**
 * The value checked against its field: unknown keys are dropped, a missing key is left out, and anything of the wrong
 * type, over its length or item cap, or outside its allowed values is refused. Keys come back in the field's order.
 */
export function pick(value: unknown, field: Field, path: string): unknown {
  switch (field.kind) {
    case "text":
      if (typeof value !== "string") return refuse(path, "must be text");
      if (value.length > field.max) return refuse(path, `must be at most ${field.max} characters`);
      if (field.values && !field.values.includes(value)) return refuse(path, "is not an allowed value");
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return refuse(path, "must be a number");
      return value;
    case "boolean":
      if (typeof value !== "boolean") return refuse(path, "must be true or false");
      return value;
    case "list":
      if (!Array.isArray(value)) return refuse(path, "must be a list");
      if (value.length > field.max) return refuse(path, `must have at most ${field.max} items`);
      return value.map((v, i) => pick(v, field.of, `${path}[${i}]`));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return refuse(path, "must be an object");
      const from = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, f] of Object.entries(field.fields)) {
        if (!Object.hasOwn(from, key) || from[key] === undefined) continue;
        out[key] = pick(from[key], f, `${path}.${key}`);
      }
      return out;
    }
  }
}

/**
 * Client JSON as prompt data: the whole value is size-capped first (the same "Input too large." as before), then
 * checked against its field, then written inside a triple-quote fence. JSON.stringify escapes every double quote in a
 * string, so no text the client sends can close the fence. Every step that fences a value needs it, so a missing
 * value is refused with a 400 before any model call.
 */
export function fencedJson(value: unknown, field: Field, name: string, max = FENCE_MAX): string {
  clip(value, max);
  if (value == null) return refuse(name, "is required");
  return `"""${clip(pick(value, field, name), max)}"""`;
}

/** A text cut to `max` characters, ending with an ellipsis when it was longer. */
export function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** The size cap on a whole fenced value, as JSON (the shift summary has a larger one). */
export const FENCE_MAX = 6000;

/**
 * A step's own answer cut to what the next step accepts, so a 200 from one step is never a 400 on the next. First
 * each list keeps its first items and each text its first characters, up to its field's caps. Values of another
 * type, texts with a fixed set of values, and keys the field does not name are left as they are: the step's schema
 * already fixed those. Then, while the whole value is still over the size cap, the longest list loses its last item.
 * Every list keeps at least one item, and the `keep` values (the fixed texts a step adds) are never removed.
 */
export function fit<T>(value: T, field: Field, keep: readonly unknown[] = [], max = FENCE_MAX): T {
  const out = fitField(structuredClone(value), field);
  while (JSON.stringify(out).length > max && dropOne(out, keep)) {
    /* one item at a time, from the longest list */
  }
  return out;
}

function fitField<T>(value: T, field: Field): T {
  switch (field.kind) {
    case "text":
      return (typeof value === "string" && !field.values ? clipText(value, field.max) : value) as T;
    case "list":
      return (Array.isArray(value) ? value.slice(0, field.max).map((v: unknown) => fitField(v, field.of)) : value) as T;
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const out = value as Record<string, unknown>;
      for (const [key, f] of Object.entries(field.fields))
        if (Object.hasOwn(out, key)) out[key] = fitField(out[key], f);
      return value;
    }
    default:
      return value;
  }
}

/** Every list in a value, nested ones too. */
function listsIn(value: unknown, found: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    found.push(value);
    for (const v of value) listsIn(v, found);
  } else if (value && typeof value === "object") for (const v of Object.values(value)) listsIn(v, found);
  return found;
}

/** Removes the last item that may go from the longest list that has more than one item. False when none can. */
function dropOne(value: unknown, keep: readonly unknown[]): boolean {
  const size = (v: unknown) => JSON.stringify(v).length;
  const lists = listsIn(value).filter((l) => l.length > 1 && l.some((x) => !keep.includes(x)));
  const longest = lists.sort((a, b) => size(b) - size(a))[0];
  if (!longest) return false;
  for (let i = longest.length - 1; i >= 0; i -= 1)
    if (!keep.includes(longest[i])) {
      longest.splice(i, 1);
      break;
    }
  return true;
}

// The caps are about two to four times the longest value the recorded runs and the rules give for that field
// (tests/prompt-inputs.test.ts checks every pack's recorded run and rules output against them), so a real run always
// fits and a crafted body cannot fill the prompt.

/** An investigation, as the investigate step writes it. `sources` are the pack's named evidence sources. */
export const investigationField = (sources: readonly string[]): Field =>
  record({
    symptom: text(800),
    impact: list(text(300), 6),
    evidence: list(record({ point: text(400), source: text(80, sources), quote: text(300), quote_verified: flag }), 8),
    hypotheses: list(
      record({
        statement: text(500),
        status: text(40, ["leading hypothesis", "alternative hypothesis"]),
        supports: list(text(300), 4),
        against_or_gaps: list(text(300), 4),
      }),
      4,
    ),
    ruled_out: list(text(300), 8),
    open_questions: list(text(300), 6),
  });

/** The most items a handoff's attached evidence may have, the lab test included. */
export const HANDOFF_EVIDENCE_MAX = 10;
/** The most steps an article may have, the desk's fixed first and last steps included. */
export const ARTICLE_STEPS_MAX = 8;
/** The most ids an article's related list may have. */
export const ARTICLE_RELATED_MAX = 60;
/** The longest triage summary a step keeps: the shift summary lists it after the ticket id, in a 300-character item. */
export const TRIAGE_SUMMARY_MAX = 200;

/** An engineering handoff, as the handoff step writes it. `rules` are the pack's escalation rule keys. */
export const handoffField = (rules: readonly string[]): Field =>
  record({
    title: text(200),
    severity: text(2, SEVERITIES),
    scope: text(400),
    rules_triggered: list(text(40, rules), 10),
    reproduction: list(text(500), 8),
    evidence_attached: list(text(300), HANDOFF_EVIDENCE_MAX),
    ruled_out: list(text(300), 8),
    workaround_in_place: text(500),
    the_ask: text(600),
    hypothesis_note: text(600),
  });

/** A knowledge base article, as the kb step writes it. */
export const ARTICLE = record({
  title: text(200),
  applies_when: list(text(300), 6),
  how_to_confirm: list(text(400), 6),
  steps: list(text(400), ARTICLE_STEPS_MAX),
  escalate_if: list(text(300), 8),
  status_note: text(500),
  related: list(text(20), ARTICLE_RELATED_MAX),
});

/** The shift summary the desk sends to the shift note (src/run/selectors.ts, shiftSummary). */
export const SHIFT_SUMMARY = record({
  open_at_start: num,
  approved_for_closure: num,
  held_by_repeat_guardrail: list(text(20), 60),
  still_open: num,
  needs_a_person: list(text(300), 60),
  ai_agreement: record({ triaged: num, changed_by_person: num, decided_by_rules_fallback: num }),
  incident: record({ ref: text(40), held_tickets: list(text(20), 60) }),
  escalated: record({ ref: text(40), title: text(200), workaround: list(text(400), 8) }),
  kb_article_published: flag,
});

/**
 * The article a new ticket is checked against, fenced for the prompt. It must be an object with a non-empty title,
 * since the check answers with that title; anything else is a 400.
 */
export function articleFor(input: { article?: unknown } | null | undefined): { title: string; fenced: string } {
  const article = input?.article as { title?: unknown } | null | undefined;
  const title = article && typeof article === "object" ? article.title : undefined;
  if (typeof title !== "string" || !title.trim())
    throw new StepError("Send the knowledge base article, with a title.", 400);
  return { title, fenced: fencedJson(article, ARTICLE, "article") };
}

/** The new-ticket check's detail when it corrected a matched article that disagreed with the yes or no. */
export const CORRECTED = {
  title: "corrected to the real title",
  none: 'corrected to "none", as there is no match',
} as const;

/** The article's title for a check that already passed `articleFor`, or "" for a direct call with no article. */
export function articleTitle(input: { article?: unknown } | null | undefined): string {
  const title = (input?.article as { title?: unknown } | null | undefined)?.title;
  return typeof title === "string" && title.trim() ? title : "";
}
