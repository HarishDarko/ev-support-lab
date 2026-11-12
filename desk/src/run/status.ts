// The one line both "Run it live" controls show while a live run goes: which step is running, in plain words,
// how many answers are in, about how long is left, and what has been spent.
import { liveSpendText } from "./cost";
import type { RunSteps, StepKey } from "./types";

/** What each step is doing, as it reads after "Claude is". */
const DOING: Record<StepKey, string> = {
  triage: "reading and sorting the tickets",
  patterns: "looking for patterns across the tickets",
  investigate: "writing the investigation",
  handoff: "writing the handoff packet",
  verify: "checking the verification reading",
  kb: "writing the knowledge base article",
  shiftnote: "writing the end-of-shift note",
  classify: "checking the new ticket against the article",
};

export interface RunStatusInput {
  /** Steps with a call out now, slowest first. Triage appears once per batch. */
  inFlight: readonly StepKey[];
  settled: number;
  total: number;
  /** Answers a model gave, as opposed to the rules. */
  ai: number;
  secondsLeft: number;
  spent: number;
  unpriced: boolean;
}

/** "Claude is writing the investigation. 9 of 15 answers in, about 15 seconds left. Live · $0.06 so far" */
export function runStatusText({ inFlight, settled, total, ai, secondsLeft, spent, unpriced }: RunStatusInput): string {
  const running = [...new Set(inFlight)];
  const who = settled > 0 && ai === 0 ? "No model has answered yet, so the rules are" : "Claude is";
  const [first, second] = running.map((s) => DOING[s]);
  const doing =
    running.length === 0
      ? "starting the next step"
      : running.length === 1
        ? first
        : running.length === 2
          ? `${first} and ${second}`
          : `${first}, and ${running.length - 1} other steps are running`;
  const left =
    secondsLeft <= 0 ? "almost done" : `about ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"} left`;
  return `${who} ${doing}. ${settled} of ${total} answers in, ${left}. ${liveSpendText(spent, unpriced)}`;
}

/** The steps in flight, the one that usually takes longest first (from a run's own step times). */
export function slowestFirst(inFlight: readonly StepKey[], steps: RunSteps): StepKey[] {
  const ms = (k: StepKey) => (k === "triage" ? Math.max(0, ...steps.triage.map((b) => b.ms)) : steps[k].ms);
  return [...new Set(inFlight)].sort((a, b) => ms(b) - ms(a));
}

/** Whole seconds left of the usual run time, never below zero. */
export const secondsLeft = (usualSeconds: number, elapsedMs: number): number =>
  Math.max(0, Math.round(usualSeconds - elapsedMs / 1000));
