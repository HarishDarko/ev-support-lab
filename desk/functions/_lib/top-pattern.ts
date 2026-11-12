// Which pattern a short-chain article is about. Kept apart so the browser can use it without the steps.
import type { PatternModel } from "./steps";

/** The pattern the article is about: a recurring one first, then the one with most open tickets. */
export function topPattern<P extends Pick<PatternModel, "name" | "recurring" | "ticket_ids">>(patterns: P[]): P | null {
  const score = (p: P) => (p.recurring ? 1000 : 0) + p.ticket_ids.length;
  return [...patterns].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0] ?? null;
}
