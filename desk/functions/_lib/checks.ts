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

// Numbers of 4 or more, or with decimals, that appear in the output but nowhere in the input. A comma-grouped number
// ("1,200", "$15,000") is one number, compared without its commas, so "1,200" in the output matches "1200" or "1,200"
// in the input and is never read as "1" and "200".
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
export function ungroundedNumbers(output: unknown, input: unknown): string[] {
  const numbers = (text: unknown) => String(text).match(NUMBER) ?? [];
  const plain = (n: string) => n.replace(/,/g, "");
  const allowed = new Set(numbers(input).map(plain));
  const out = new Map<string, string>();
  for (const n of numbers(JSON.stringify(output))) {
    const key = plain(n);
    if ((Number(key) >= 4 || key.includes(".")) && !allowed.has(key) && !out.has(key)) out.set(key, n);
  }
  return [...out.values()];
}

export const check = (name: string, passed: boolean, detail = ""): Check => ({ name, passed, detail });
