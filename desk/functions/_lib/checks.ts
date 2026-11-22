// Checks applied to model output before anything reaches the screen. Neutral: no industry content here.
// Evidence must be quoted exactly from the input; numbers must come from the input.
import type { RunbookExceptionRule } from "../../shared/packs/types";
import type { Check } from "./types";

export class ValidationError extends Error {}

export function normalize(text: unknown): string {
  // Model output is untrusted: coerce whatever arrives, exactly as the prototype did.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// True when the quote appears in the source text, ignoring case and spacing.
// A quote shortened with an ellipsis passes only if every piece appears in the source, in order. It may have at most
// three pieces of at least four characters each, so a string of single letters split by ellipses is not a quote.
export const MAX_QUOTE_PIECES = 3;
export const MIN_QUOTE_PIECE = 4;
export function quoted(quote: unknown, source: unknown): boolean {
  const src = normalize(source);
  const pieces = normalize(quote)
    .split(/\.\.\.|…/)
    .map((p) => p.replace(/^["'.,\s]+|["'.,\s]+$/g, ""))
    .filter(Boolean);
  if (!pieces.length || pieces.length > MAX_QUOTE_PIECES || pieces.join("").length < 6) return false;
  if (pieces.length > 1 && pieces.some((p) => p.length < MIN_QUOTE_PIECE)) return false;
  let from = 0;
  for (const piece of pieces) {
    const at = src.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return true;
}

// The first exception that applies to a runbook for this ticket, or null.
export function exceptionIn(
  exceptions: Record<string, RunbookExceptionRule[]>,
  runbook: string,
  text: unknown,
  fw?: string,
): { name: string; hit: string } | null {
  for (const e of exceptions[runbook] ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const hit = e.test(String(text ?? ""), fw);
    if (hit) return { name: e.name, hit };
  }
  return null;
}
export const exceptionNamesIn = (exceptions: Record<string, RunbookExceptionRule[]>, runbook: string): string[] =>
  (exceptions[runbook] ?? []).map((e) => e.name);
export const mentions = (text: unknown, terms: string[]): boolean =>
  terms.length === 0 || terms.some((t) => normalize(text).includes(t));

// Numbers of 4 or more, or with decimals, that appear in the output but nowhere in the input.
// A comma counts as a thousands separator only inside a valid group pattern: 1 to 3 digits, then groups of exactly 3,
// not part of a longer run of digits and commas. So "1,200" and "$15,000" are one number each (compared without their
// commas, never read as "1" and "200"), while "1,2,3" or "1,2345" are separate numbers. A token whose groups are all
// 3-digit numbers with no leading zero ("500,503", "120,450") can be a short list as well as a number, so either
// reading grounds it. A group with a leading zero ("100,000", "429,014") is only ever a thousands group, so "100" in
// the input never grounds "100,000". The output is read value by value, so a list of numbers ([120, 450]) is never
// joined into one.
const NUMBER = /(?<![\d,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d|,\d)|\d+(?:\.\d+)?/g;
interface NumberToken {
  raw: string;
  joined: string;
  /** The comma-separated parts, when the token could also be a list of 3-digit numbers (100 to 999). */
  parts: string[] | null;
}
function numberTokens(text: string): NumberToken[] {
  return (text.match(NUMBER) ?? []).map((raw) => {
    const parts = raw.split(",");
    const list = parts.length > 1 && parts.every((part) => /^[1-9]\d{2}$/.test(part));
    return { raw, joined: raw.replace(/,/g, ""), parts: list ? parts : null };
  });
}
/** Every key, string and number in a value, one per line, so separate values never run together. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => k + "\n" + textOf(v))
      .join("\n");
  // Model output is untrusted: whatever arrives is read as text.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}
export function ungroundedNumbers(output: unknown, input: unknown): string[] {
  const counts = (n: string) => Number(n) >= 4 || n.includes(".");
  const allowed = new Set<string>();
  for (const t of numberTokens(textOf(input))) {
    allowed.add(t.joined);
    for (const part of t.parts ?? []) allowed.add(part);
  }
  const out = new Map<string, string>();
  for (const t of numberTokens(textOf(output))) {
    if (!counts(t.joined) || allowed.has(t.joined) || out.has(t.joined)) continue;
    if (t.parts?.every((part) => allowed.has(part))) continue;
    out.set(t.joined, t.raw);
  }
  return [...out.values()];
}

export const check = (name: string, passed: boolean, detail = ""): Check => ({ name, passed, detail });
