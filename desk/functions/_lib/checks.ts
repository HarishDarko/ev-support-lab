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
// A quote shortened with an ellipsis passes only if every piece appears in the source, in order.
export function quoted(quote: unknown, source: unknown): boolean {
  const src = normalize(source);
  const pieces = normalize(quote)
    .split(/\.\.\.|…/)
    .map((p) => p.replace(/^["'.,\s]+|["'.,\s]+$/g, ""))
    .filter(Boolean);
  if (!pieces.length || pieces.join("").length < 6) return false;
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
export function ungroundedNumbers(output: unknown, input: unknown): string[] {
  const found = (text: unknown) => new Set(String(text).match(/\d+(?:\.\d+)?/g) ?? []);
  const allowed = found(input);
  const out: string[] = [];
  for (const n of found(JSON.stringify(output))) {
    if ((Number(n) >= 4 || n.includes(".")) && !allowed.has(n)) out.push(n);
  }
  return out;
}

export const check = (name: string, passed: boolean, detail = ""): Check => ({ name, passed, detail });
