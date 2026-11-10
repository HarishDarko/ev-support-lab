// The live runner for a pack with no incident (the short chain):
//
//   triage (all batches in parallel) -> patterns -> knowledge base article -> new-ticket check
//                                                                         -> end-of-shift note
//
// Every request names its pack. The EV chain (live.ts) is separate and unchanged.
import { topPattern } from "../../functions/_lib/top-pattern";
import { BATCH_SIZE, type PostStep } from "./live";
import type { PatternsData, StepKey, StepResult, TriageData } from "./types";

/** What the short chain needs to know about a pack. */
export interface ShortChainPack {
  id: string;
  ticketIds: readonly string[];
  newTicketExample?: string;
}

/** The API calls in one short chain: the triage batches, then patterns, the article, the check and the note. */
export const shortChainCalls = (tickets: number): number => Math.ceil(tickets / BATCH_SIZE) + 4;

export interface ShortChainReport {
  results: Partial<Record<Exclude<StepKey, "triage">, StepResult<unknown>>> & { triage: StepResult<TriageData>[] };
  spent: number;
  failures: { step: StepKey; message: string }[];
  answered: number;
  aiAnswered: number;
  total: number;
}

export interface ShortChainOptions {
  pack: ShortChainPack;
  post: PostStep;
  onUpdate?: (step: StepKey, result: StepResult<unknown> | null, message?: string) => void;
  signal?: AbortSignal;
}

export async function runShortChain({ pack, post, onUpdate, signal }: ShortChainOptions): Promise<ShortChainReport> {
  const batches = Array.from({ length: Math.ceil(pack.ticketIds.length / BATCH_SIZE) }, (_, i) =>
    pack.ticketIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
  );
  const report: ShortChainReport = {
    results: { triage: [] },
    spent: 0,
    failures: [],
    answered: 0,
    aiAnswered: 0,
    total: shortChainCalls(pack.ticketIds.length),
  };
  const fail = (step: StepKey, message: string) => {
    report.failures.push({ step, message });
    onUpdate?.(step, null, message);
  };
  async function call(step: StepKey, body: Record<string, unknown>): Promise<StepResult<unknown> | null> {
    if (signal?.aborted) return null;
    try {
      const result = await post(step, { ...body, pack: pack.id }, signal);
      report.answered += 1;
      report.spent += result.trace.cost;
      if (result.trace.source === "ai") report.aiAnswered += 1;
      onUpdate?.(step, result);
      return result;
    } catch (error) {
      fail(step, error instanceof Error ? error.message : "The live call failed.");
      return null;
    }
  }

  const triage = await Promise.all(batches.map((ids) => call("triage", { ids })));
  report.results.triage = triage.filter((t): t is StepResult<TriageData> => t !== null);
  const rows = report.results.triage.flatMap((t) => t.data.results);
  const patterns = await call("patterns", {
    triage: rows.map(({ id, component, severity, action }) => ({ id, component, severity, action })),
  });
  if (patterns) report.results.patterns = patterns;

  const summary = {
    open_at_start: pack.ticketIds.length,
    approved_for_closure: rows.filter((r) => r.action === "close_with_runbook").length,
    needs_a_person: rows.filter((r) => r.action === "needs_human").map((r) => `${r.id}: ${r.summary}`),
  };
  if (signal?.aborted) return report;
  const pattern = patterns ? topPattern((patterns.data as PatternsData).patterns) : null;
  const kb = pattern ? await call("kb", { pattern }) : null;
  if (!patterns) fail("kb", "Skipped: no result yet for patterns.");
  else if (!pattern) fail("kb", "Skipped: no recurring pattern to write an article about.");
  if (kb) report.results.kb = kb;
  if (signal?.aborted) return report;

  const skipClassify = !kb
    ? "Skipped: no article to check a new ticket against."
    : !pack.newTicketExample
      ? "Skipped: this industry has no example ticket."
      : null;
  if (skipClassify) fail("classify", skipClassify);
  const [classify, shiftnote] = await Promise.all([
    skipClassify ? Promise.resolve(null) : call("classify", { text: pack.newTicketExample, article: kb!.data }),
    call("shiftnote", { summary }),
  ]);
  if (classify) report.results.classify = classify;
  if (shiftnote) report.results.shiftnote = shiftnote;
  return report;
}
