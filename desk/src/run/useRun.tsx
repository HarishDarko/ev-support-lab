// The React side of the Run model: a provider that holds the run, and the hook everything reads it through.
// The provider starts from the recorded run, so nothing waits on the network. `runLive()` re-runs the chain in
// the background and merges answers as they land.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { classifyTicket } from "./classify";
import { runLabel } from "./cost";
import { CHAIN_CALLS, liveNote, mergeUpdate, postTo, runChain, type PostStep } from "./live";
import { recordedRun } from "./recorded";
import { indexRun, laneCounts, lanesOf, type TicketResult } from "./selectors";
import type { LaneCounts } from "./guardrail";
import type { ClassifyModel, Lane, Run, RunSource, RunStatus, StepResult } from "./types";

export interface RunApi {
  run: Run;
  source: RunSource;
  status: RunStatus;
  /** Estimated cost of every live call this visit, in USD, repeats included. */
  spent: number;
  /** Some live call ran on a model with no list price, so `spent` is a floor. */
  unpriced: boolean;
  /** One line when the last live run did not go fully to plan. Null otherwise. */
  message: string | null;
  /** Calls settled so far while a live run is going. Null when none is. */
  progress: { settled: number; total: number } | null;
  /** What the run is, in words: "Recorded run, rules only ..." or "Live run". */
  label: string;
  runLive: () => Promise<void>;
  /** Checks a ticket text against the article, live. Falls back to the rules, labelled in the trace. */
  classify: (text: string) => Promise<StepResult<ClassifyModel>>;
  /** The lane of a ticket, or undefined if it has no result. */
  lane: (id: string) => Lane | undefined;
  resultFor: (id: string) => TicketResult | undefined;
  /** Ticket ids per lane, in queue order. */
  lanes: Record<Lane, string[]>;
  counts: LaneCounts;
}

const RunContext = createContext<RunApi | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** A run to start from instead of the committed recording. For tests and the harness. */
  initial?: Run;
  /** How steps are called. Defaults to POST /api/<step>. For tests. */
  post?: PostStep;
}

export function RunProvider({ children, initial, post }: ProviderProps) {
  const [run, setRun] = useState<Run>(() => initial ?? recordedRun());
  const [status, setStatus] = useState<RunStatus>("idle");
  const [spent, setSpent] = useState(0);
  // Some live call ran on a model with no list price, so `spent` is a floor.
  const [unpriced, setUnpriced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunApi["progress"]>(null);

  const postStep = useMemo(() => post ?? postTo(), [post]);
  const latest = useRef(run);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current = run;
  }, [run]);
  useEffect(() => () => controller.current?.abort(), []);

  const runLive = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStatus("running");
    setMessage(null);
    setProgress({ settled: 0, total: CHAIN_CALLS });
    const report = await runChain({
      post: postStep,
      base: latest.current.steps,
      signal: abort.signal,
      onUpdate: (update) => {
        setRun((current) => mergeUpdate(current, update));
        if (update.outcome !== "failed") {
          setSpent((total) => total + update.result.trace.cost);
          if (update.result.trace.unpriced) setUnpriced(true);
        }
        setProgress({ settled: update.settled, total: CHAIN_CALLS });
      },
    });
    busy.current = false;
    if (abort.signal.aborted) return;
    setProgress(null);
    setStatus(report.answered === 0 ? "failed" : "done");
    setMessage(liveNote(report));
  }, [postStep]);

  const classify = useCallback(
    async (text: string) => {
      const result = await classifyTicket(postStep, text, latest.current.steps.kb.data);
      setSpent((total) => total + result.trace.cost);
      if (result.trace.unpriced) setUnpriced(true);
      return result;
    },
    [postStep],
  );

  const index = useMemo(() => indexRun(run), [run]);
  const lanes = useMemo(() => lanesOf(index), [index]);
  const counts = useMemo(() => laneCounts(index), [index]);
  const label = runLabel(run);

  const value = useMemo<RunApi>(
    () => ({
      run,
      source: run.source,
      status,
      spent,
      unpriced,
      message,
      progress,
      label,
      runLive,
      classify,
      lane: (id) => index.get(id)?.lane,
      resultFor: (id) => index.get(id),
      lanes,
      counts,
    }),
    [run, status, spent, unpriced, message, progress, label, runLive, classify, index, lanes, counts],
  );

  return <RunContext value={value}>{children}</RunContext>;
}

export function useRun(): RunApi {
  const api = useContext(RunContext);
  if (!api) throw new Error("useRun must be used inside <RunProvider>.");
  return api;
}
