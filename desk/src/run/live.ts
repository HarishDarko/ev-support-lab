// The live runner: the chain the prototype ran (prototype/public/desk.js: runTriage, chain) against /api/*.
//
//   triage (all batches in parallel) -> patterns -> investigate -> verify
//                                                                -> handoff -> kb -> classify
//                                                                           -> shiftnote
//
// The same function drives `npm run record`, so a recording and a visitor's live run cannot differ.
// Answers are reported one at a time as they land. An answer is merged unless it is a rules fallback that would
// replace an AI result: a rate limit or a model error never makes the screen worse.
import { NEW_TICKET_EXAMPLE, TICKETS } from "../data/synthetic";
import { indexTriage, shiftSummary } from "./selectors";
import type { Run, RunSteps, StepData, StepKey, StepResult, TriageData } from "./types";

/** Tickets per triage call, as the prototype sent them. The API accepts 1 to 10. */
export const BATCH_SIZE = 5;

export const TRIAGE_BATCHES: readonly (readonly string[])[] = Array.from(
  { length: Math.ceil(TICKETS.length / BATCH_SIZE) },
  (_, i) => TICKETS.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).map((t) => t.id),
);

/** The number of API calls in one full chain: the triage batches plus seven single-call steps. */
export const CHAIN_CALLS = TRIAGE_BATCHES.length + 7;

/** Sends one request to a step. Throws an Error with a readable message on any failure. */
export type PostStep = (step: StepKey, body: unknown, signal?: AbortSignal) => Promise<StepResult<unknown>>;

/** POST `<baseUrl>/api/<step>` with a JSON body. */
export function postTo(baseUrl = ""): PostStep {
  return async (step, body, signal) => {
    const res = await fetch(`${baseUrl}/api/${step}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal,
    });
    const json = (await res.json().catch(() => ({ error: "The server sent an unreadable reply." }))) as {
      error?: string;
    } & Partial<StepResult<unknown>>;
    if (!res.ok || !json.data || !json.trace) throw new Error(json.error ?? "The desk server didn't answer.");
    return { data: json.data, trace: json.trace, ms: json.ms ?? 0 };
  };
}

/** A live rules fallback must not replace an answer the model gave. */
export function replaces(current: StepResult<unknown> | undefined, incoming: StepResult<unknown>): boolean {
  return !(current?.trace.source === "ai" && incoming.trace.source === "rules");
}

/** One call settling. `kept` means the answer was a rules fallback and the recorded AI result stays. */
export type ChainUpdate =
  | { outcome: "merged" | "kept"; step: StepKey; batch?: number; result: StepResult<unknown>; settled: number }
  | { outcome: "failed"; step: StepKey; batch?: number; message: string; settled: number };

export interface ChainReport {
  /** The finished steps (accepted live answers over the base), or null if some step has no result at all. */
  steps: RunSteps | null;
  /** Estimated cost of every call that answered, in USD. */
  spent: number;
  failures: { step: StepKey; message: string }[];
  /** Steps whose live answer was a rules fallback and so did not replace an AI result. */
  keptRecorded: StepKey[];
  /** The server's reason for the first fallback to rules, if any (for example a rate limit). */
  fallbackReason: string | null;
  answered: number;
  aiAnswered: number;
  total: number;
}

export interface ChainOptions {
  post: PostStep;
  /** Results to fall back on and compare against. Absent when recording from nothing. */
  base?: RunSteps;
  onUpdate?: (update: ChainUpdate) => void;
  signal?: AbortSignal;
}

type SingleKey = Exclude<StepKey, "triage">;
const SINGLE_KEYS: readonly SingleKey[] = [
  "patterns",
  "investigate",
  "handoff",
  "verify",
  "kb",
  "shiftnote",
  "classify",
];

export async function runChain({ post, base, onUpdate, signal }: ChainOptions): Promise<ChainReport> {
  const triage: (StepResult<TriageData> | undefined)[] = base ? [...base.triage] : TRIAGE_BATCHES.map(() => undefined);
  const singles: { [K in SingleKey]?: StepResult<StepData[K]> } = {};
  if (base) for (const key of SINGLE_KEYS) (singles as Record<SingleKey, unknown>)[key] = base[key];
  const report: ChainReport = {
    steps: null,
    spent: 0,
    failures: [],
    keptRecorded: [],
    fallbackReason: null,
    answered: 0,
    aiAnswered: 0,
    total: CHAIN_CALLS,
  };
  let settled = 0;

  /** Posts, then merges unless that would replace AI with rules. */
  async function settle(step: StepKey, body: unknown, batch?: number): Promise<void> {
    if (signal?.aborted) return;
    try {
      const result = await post(step, body, signal);
      settled += 1;
      report.answered += 1;
      report.spent += result.trace.cost;
      if (result.trace.source === "ai") report.aiAnswered += 1;
      else report.fallbackReason ??= result.trace.fallbackReason ?? null;
      const current = step === "triage" ? triage[batch ?? 0] : singles[step];
      const outcome = replaces(current, result) ? "merged" : "kept";
      if (outcome === "kept") {
        if (!report.keptRecorded.includes(step)) report.keptRecorded.push(step);
      } else if (step === "triage") triage[batch ?? 0] = result as StepResult<TriageData>;
      else (singles as Record<SingleKey, unknown>)[step] = result;
      onUpdate?.({ outcome, step, batch, result, settled });
    } catch (error) {
      if (signal?.aborted) return;
      settled += 1;
      const message = error instanceof Error ? error.message : "The live call failed.";
      report.failures.push({ step, message });
      onUpdate?.({ outcome: "failed", step, batch, message, settled });
    }
  }

  // A step runs only when what it reads exists. With a base that is always so. When recording from nothing,
  // a failed upstream step leaves its dependants out, and the report says so.
  async function single(step: SingleKey, needs: readonly StepKey[], body: () => unknown): Promise<void> {
    const missing = needs.filter((n) => (n === "triage" ? triage.some((t) => !t) : !singles[n]));
    if (missing.length) {
      settled += 1;
      const message = `Skipped: no result yet for ${missing.join(", ")}.`;
      report.failures.push({ step, message });
      onUpdate?.({ outcome: "failed", step, message, settled });
      return;
    }
    await settle(step, body());
  }

  const triageRows = () =>
    triage
      .flatMap((t) => t?.data.results ?? [])
      .map(({ id, component, severity, action }) => ({ id, component, severity, action }));

  await Promise.all(TRIAGE_BATCHES.map((ids, i) => settle("triage", { ids }, i)));
  await single("patterns", ["triage"], () => ({ triage: triageRows() }));
  await single("investigate", [], () => ({}));
  await Promise.all([
    single("verify", [], () => ({})),
    (async () => {
      await single("handoff", ["investigate"], () => ({ investigation: singles.investigate?.data }));
      await Promise.all([
        (async () => {
          const article = () => ({ investigation: singles.investigate?.data, handoff: singles.handoff?.data });
          await single("kb", ["investigate", "handoff"], article);
          await single("classify", ["kb"], () => ({ text: NEW_TICKET_EXAMPLE, article: singles.kb?.data }));
        })(),
        single("shiftnote", ["triage", "handoff"], () => ({
          summary: shiftSummary(indexTriage(triage as StepResult<TriageData>[]), singles.handoff!.data.title),
        })),
      ]);
    })(),
  ]);

  if (triage.every(Boolean) && SINGLE_KEYS.every((k) => singles[k])) {
    report.steps = { ...(singles as Omit<RunSteps, "triage">), triage: triage as StepResult<TriageData>[] };
  }
  return report;
}

/** Puts one landed answer into a run. A run turns `live` as soon as a live answer has been merged. */
export function mergeUpdate(run: Run, update: ChainUpdate): Run {
  if (update.outcome !== "merged") return run;
  const result = { ...update.result, live: true };
  const { step } = update;
  const steps: RunSteps =
    step === "triage"
      ? {
          ...run.steps,
          triage: run.steps.triage.map((t, i) => (i === update.batch ? (result as StepResult<TriageData>) : t)),
        }
      : { ...run.steps, [step]: result };
  return { ...run, source: "live", steps };
}

/** One line for the screen when a live run did not go fully to plan. Null when it did. */
export function liveNote(report: ChainReport): string | null {
  const { answered, aiAnswered, failures, keptRecorded, fallbackReason, total } = report;
  if (answered === 0) {
    const why = failures[0]?.message ?? "no answer";
    return `The live run didn't reach the desk server (${why}). The earlier results stay.`;
  }
  if (aiAnswered === 0) {
    const outcome = keptRecorded.length ? "The earlier results are kept." : "These results come from the rules.";
    return `No live model answered (${fallbackReason ?? "rules fallback"}). ${outcome}`;
  }
  const notModel = total - aiAnswered;
  if (notModel === 0) return null;
  const why = fallbackReason ?? failures[0]?.message ?? "a check failed";
  return `${notModel} of ${total} live calls didn't produce a model answer (${why}). Those steps keep their recorded results.`;
}
