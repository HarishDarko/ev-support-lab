// Client-supplied JSON that goes back into a prompt: an earlier step's output (the investigation, the handoff), the
// knowledge base article a new ticket is checked against, and the shift summary. The client could send anything, so
// each value is reduced to the fields that step can really produce. Every field has a type, a length cap for text and
// an item cap for lists; any other field is dropped, and a value of the wrong type or over a cap is refused with a
// 400. What is left goes into the prompt inside a triple-quote fence, marked as data. Neutral: no industry content.
import { ValidationError, check } from "./checks";
import { StepError, clip } from "./errors";
import { SEVERITIES } from "./kit";
import type { Check } from "./types";

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
 * Every list keeps at least one item, and the `keep` values (the fixed texts a step adds) are never removed. The cap
 * counts the value as JSON, where a quote or a backslash takes two characters, so a value can be within every
 * character cap and still too long with every list down to one item: then the longest texts are cut to one common
 * length, the longest that lets the whole value fit, so the cut is shared and no single text is cut to nothing while
 * others stay whole.
 *
 * `last` names a list of the top-level object whose items go after every other list's: while any other list can lose
 * an item, it is left whole. Then it loses its last items, down to `min`, before any text is cut, so a short value
 * keeps its whole texts rather than every item. Its own texts are cut last. The result can still be over the cap; a
 * caller that must fit checks.
 */
export function fit<T>(value: T, field: Field, keep: readonly unknown[] = [], max = FENCE_MAX, last?: Last): T {
  const out = fitField(structuredClone(value), field);
  const over = () => JSON.stringify(out).length - max;
  const held = last && field.kind === "object" ? (out as Record<string, unknown>)[last.key] : undefined;
  const heldField = last && field.kind === "object" ? field.fields[last.key] : undefined;
  const inHeld = new Set(nodesIn(held));
  while (over() > 0 && dropOne(out, keep, inHeld)) {
    /* one item at a time, from the longest list */
  }
  if (last && Array.isArray(held))
    while (over() > 0 && held.length > last.min && dropLast(held, keep)) {
      /* the held list's last items, down to its minimum */
    }
  if (over() > 0) cutToFit(textsIn(out, field), keep, inHeld, over);
  if (over() > 0 && last && Array.isArray(held) && heldField) cutToFit(textsIn(held, heldField), keep, new Set(), over);
  return out;
}

/** The list `fit` trims last, and the fewest items it keeps. */
export interface Last {
  key: string;
  min: number;
}

/** Every list and object in a value, the value included. */
function nodesIn(value: unknown, found: object[] = []): object[] {
  if (value && typeof value === "object") {
    found.push(value);
    for (const v of Object.values(value)) nodesIn(v, found);
  }
  return found;
}

/** Removes a list's last item that may go. False when none can. */
function dropLast(list: unknown[], keep: readonly unknown[]): boolean {
  for (let i = list.length - 1; i >= 0; i -= 1)
    if (!keep.includes(list[i])) {
      list.splice(i, 1);
      return true;
    }
  return false;
}

interface TextAt {
  holder: Record<string, unknown> | unknown[];
  key: string | number;
}

/** Every text in a value that its field lets `fit` cut (not one with a fixed set of values). */
function textsIn(value: unknown, field: Field, found: TextAt[] = []): TextAt[] {
  if (field.kind === "list" && Array.isArray(value)) {
    const of = field.of;
    if (of.kind === "text") {
      if (!of.values) value.forEach((v, i) => typeof v === "string" && found.push({ holder: value, key: i }));
    } else for (const v of value) textsIn(v, of, found);
  } else if (field.kind === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const holder = value as Record<string, unknown>;
    for (const [key, f] of Object.entries(field.fields)) {
      if (!Object.hasOwn(holder, key)) continue;
      if (f.kind !== "text") textsIn(holder[key], f, found);
      else if (!f.values && typeof holder[key] === "string") found.push({ holder, key });
    }
  }
  return found;
}

/**
 * Cuts the texts, except those held in `skip` and the `keep` values, to one common length: the longest that brings
 * `over` to zero, or one character (an ellipsis) when none does. Texts already shorter are left as they are.
 */
function cutToFit(texts: TextAt[], keep: readonly unknown[], skip: ReadonlySet<object>, over: () => number): void {
  const holder = ({ holder }: TextAt) => holder as Record<string | number, string>;
  const cuttable = texts.filter((t) => !skip.has(t.holder) && !keep.includes(holder(t)[t.key]));
  const whole = cuttable.map((t) => holder(t)[t.key]!);
  const cutTo = (length: number) =>
    cuttable.forEach((t, i) => (holder(t)[t.key] = clipText(whole[i]!, Math.max(1, length))));
  let [low, high] = [1, Math.max(1, ...whole.map((w) => w.length))];
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    cutTo(mid);
    if (over() <= 0) low = mid;
    else high = mid - 1;
  }
  cutTo(low);
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

/**
 * Removes the last item that may go from the longest list that has more than one item. Lists held in `skip` are left
 * alone. False when none can.
 */
function dropOne(value: unknown, keep: readonly unknown[], skip: ReadonlySet<object> = new Set()): boolean {
  const size = (v: unknown) => JSON.stringify(v).length;
  const lists = listsIn(value).filter((l) => !skip.has(l) && l.length > 1 && l.some((x) => !keep.includes(x)));
  const longest = lists.sort((a, b) => size(b) - size(a))[0];
  return longest ? dropLast(longest, keep) : false;
}

// The caps are about two to four times the longest value the recorded runs and the rules give for that field
// (tests/prompt-inputs.test.ts checks every pack's recorded run and rules output against them), so a real run always
// fits and a crafted body cannot fill the prompt.

/** The longest evidence quote an investigation may carry. A longer one is not kept, since cutting it would change it. */
export const QUOTE_MAX = 300;
/** The fewest verified quotes an investigation may have. */
export const EVIDENCE_MIN = 2;

/** An investigation, as the investigate step writes it. `sources` are the pack's named evidence sources. */
export const investigationField = (sources: readonly string[]): Field =>
  record({
    symptom: text(800),
    impact: list(text(300), 6),
    evidence: list(
      record({ point: text(400), source: text(80, sources), quote: text(QUOTE_MAX), quote_verified: flag }),
      8,
    ),
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

/** The size cap on the fenced shift summary, as JSON. */
export const SHIFT_SUMMARY_MAX = 8000;
/** The shortest a ticket's summary in the shift summary is cut to before any ticket is left out. */
export const PERSON_SUMMARY_MIN = 40;
/** The last item of `needs_a_person` when some tickets had to be left out, so the note says how many. */
export const moreNeedAPerson = (n: number) => `+${n} more need a person`;

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

interface Evidence {
  quote: string;
  quote_verified?: boolean;
}

/**
 * The investigate step's evidence check, then the investigation fitted for the next step without breaking it: only
 * quotes found in the source they cite are kept, each marked verified, and fewer than `EVIDENCE_MIN` is a
 * `ValidationError`, so the rules version is used. The fit trims the other fields first and never cuts a verified
 * quote; it may leave out evidence points, down to the minimum. If the investigation still does not fit, that is a
 * `ValidationError` too, rather than a quote cut short and still marked verified. Changes `data` in place.
 */
export function verifyEvidence<E extends Evidence>(
  data: { evidence: E[] },
  field: Field,
  found: (e: E) => boolean,
): Check {
  const total = data.evidence.length;
  const kept = data.evidence.filter((e) => typeof e.quote === "string" && e.quote.length <= QUOTE_MAX && found(e));
  if (kept.length < EVIDENCE_MIN)
    throw new ValidationError(`Only ${kept.length} of ${total} evidence quotes found in the source they cite`);
  data.evidence = kept.map((e) => ({ ...e, quote_verified: true }));
  const fitted = fit(
    data,
    field,
    kept.map((e) => e.quote),
    FENCE_MAX,
    { key: "evidence", min: EVIDENCE_MIN },
  );
  if (JSON.stringify(fitted).length > FENCE_MAX)
    throw new ValidationError("The investigation does not fit the next step with its verified quotes whole");
  Object.assign(data, fitted);
  const left = data.evidence.length;
  return check(
    "Each quote found in the source it cites",
    kept.length === total,
    `${kept.length} of ${total}${kept.length < total ? ", the rest removed" : ""}${
      left < kept.length ? `; ${kept.length - left} left out to fit the next step` : ""
    }`,
  );
}

/**
 * A shift summary cut to the shift note's size cap without losing a ticket that needs a person unnoticed. Each
 * `needs_a_person` entry ("<id>: <summary>") keeps its id; first every summary is cut to the same length, no shorter
 * than `PERSON_SUMMARY_MIN`. Only if that is not enough are the last tickets left out, and the list then ends with
 * "+N more need a person". Anything else over its cap is cut as `fit` cuts it.
 */
export function fitShiftSummary<T extends { needs_a_person?: string[] }>(summary: T, max = SHIFT_SUMMARY_MAX): T {
  const out = fit(summary, SHIFT_SUMMARY, [], Number.POSITIVE_INFINITY);
  const all = out.needs_a_person;
  if (!all?.length || JSON.stringify(out).length <= max) return out;
  const parts = all.map((entry) => {
    const at = entry.indexOf(": ");
    return at < 0 ? { id: "", summary: entry } : { id: entry.slice(0, at + 2), summary: entry.slice(at + 2) };
  });
  const longest = Math.max(...parts.map((p) => p.summary.length));
  const fits = (n: number, length: number) => {
    const kept = parts.slice(0, n).map((p) => p.id + clipText(p.summary, Math.max(1, length)));
    out.needs_a_person = n < parts.length ? [...kept, moreNeedAPerson(parts.length - n)] : kept;
    return JSON.stringify(out).length <= max;
  };
  for (let n = parts.length; n >= 0; n -= 1) {
    if (!fits(n, PERSON_SUMMARY_MIN)) continue;
    // The longest summary length that still fits, for every ticket kept.
    let [low, high] = [PERSON_SUMMARY_MIN, Math.max(PERSON_SUMMARY_MIN, longest)];
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(n, mid)) low = mid;
      else high = mid - 1;
    }
    fits(n, low);
    break;
  }
  // A summary still over the cap has other lists that are too long; they go before any ticket that needs a person.
  return fit(out, SHIFT_SUMMARY, [], max, { key: "needs_a_person", min: out.needs_a_person?.length ?? 0 });
}
