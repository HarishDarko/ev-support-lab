// The React side of the Run model: a provider that holds the run, and the hook everything reads it through.
// The provider starts from the recorded run, so nothing waits on the network. `runLive()` re-runs the chain in
// the background and merges answers as they land.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { classifyTicket } from "./classify";
import { chainSeconds, runLabel } from "./cost";
import { CHAIN_CALLS, TRIAGE_BATCHES, liveNote, mergeUpdate, postTo, runChain, type PostStep } from "./live";
import { recordedRun } from "./recorded";
import { indexRun, laneCounts, lanesOf, type TicketResult } from "./selectors";
import { runStatusText, secondsLeft, slowestFirst } from "./status";
import type { LaneCounts } from "./guardrail";
import type { ClassifyModel, Lane, Run, RunSource, RunStatus, StepKey, StepResult } from "./types";

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
  /**
   * Calls settled so far while a live run is going, and the steps with a call out (one entry per triage batch).
   * `ai` counts the answers a model gave; the rest came from the rules. Null when no run is going.
   */
  progress: { settled: number; total: number; ai: number; inFlight: StepKey[] } | null;
  /** While a live run goes, what is happening in plain words and about how long is left. Empty otherwise. */
  statusText: string;
  /** What a screen reader hears about a live run: its start, each finished group of steps, and its end. */
  announcement: string;
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

/** The groups of steps a screen reader hears about, in the order they usually finish. */
const ANNOUNCED_GROUPS: [steps: string[], name: string][] = [
  [["verify"], "The verification reading"],
  [["triage"], "Triage"],
  [["investigate"], "The investigation"],
  [["patterns"], "Patterns"],
  [["handoff"], "The handoff"],
  [["kb", "classify", "shiftnote"], "The article, the new-ticket check and the shift note"],
];

/** About how long a full live run takes, from the committed recording's step times. */
const USUAL_SECONDS = chainSeconds(recordedRun().steps);

export function RunProvider({ children, initial, post }: ProviderProps) {
  const [run, setRun] = useState<Run>(() => initial ?? recordedRun());
  const [status, setStatus] = useState<RunStatus>("idle");
  const [spent, setSpent] = useState(0);
  // Some live call ran on a model with no list price, so `spent` is a floor.
  const [unpriced, setUnpriced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunApi["progress"]>(null);
  const [announcement, setAnnouncement] = useState("");
  // When the running live run started, and a clock that ticks each second while it runs, for the time left.
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  const postStep = useMemo(() => post ?? postTo(), [post]);
  const latest = useRef(run);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current = run;
  }, [run]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (status !== "running") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [status]);

  const runLive = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    setStatus("running");
    setMessage(null);
    setProgress({ settled: 0, total: CHAIN_CALLS, ai: 0, inFlight: [] });
    let ai = 0;
    let settled = 0;
    const inFlight: StepKey[] = [];
    setAnnouncement(`Live run started. It usually takes about ${USUAL_SECONDS} seconds.`);
    const done = new Set<string>();
    let triageDone = 0;
    const report = await runChain({
      post: postStep,
      base: latest.current.steps,
      signal: abort.signal,
      onStart: (step) => {
        inFlight.push(step);
        setProgress({ settled, total: CHAIN_CALLS, ai, inFlight: [...inFlight] });
      },
      onUpdate: (update) => {
        settled = update.settled;
        const at = inFlight.indexOf(update.step);
        if (at >= 0) inFlight.splice(at, 1);
        setRun((current) => mergeUpdate(current, update));
        if (update.outcome !== "failed") {
          setSpent((total) => total + update.result.trace.cost);
          if (update.result.trace.unpriced) setUnpriced(true);
        }
        if (update.outcome !== "failed" && update.result.trace.source === "ai") ai += 1;
        setProgress({ settled, total: CHAIN_CALLS, ai, inFlight: [...inFlight] });
        if (update.step === "triage") triageDone += 1;
        else done.add(update.step);
        const finished = ANNOUNCED_GROUPS.find(
          ([steps]) =>
            steps.includes(update.step) &&
            steps.every((s) => (s === "triage" ? triageDone === TRIAGE_BATCHES.length : done.has(s))),
        );
        if (finished) setAnnouncement(`${finished[1]} finished.`);
      },
    });
    busy.current = false;
    if (abort.signal.aborted) return;
    setProgress(null);
    setStatus(report.answered === 0 ? "failed" : "done");
    setMessage(liveNote(report));
    // The note itself is shown in its own status line, so it is not repeated here.
    setAnnouncement("Live run finished.");
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
  const statusText =
    status === "running" && progress
      ? runStatusText({
          ...progress,
          inFlight: slowestFirst(progress.inFlight, recordedRun().steps),
          secondsLeft: secondsLeft(USUAL_SECONDS, now - startedAt),
          spent,
          unpriced,
        })
      : "";

  const value = useMemo<RunApi>(
    () => ({
      run,
      source: run.source,
      status,
      spent,
      unpriced,
      message,
      progress,
      statusText,
      announcement,
      label,
      runLive,
      classify,
      lane: (id) => index.get(id)?.lane,
      resultFor: (id) => index.get(id),
      lanes,
      counts,
    }),
    [
      run,
      status,
      spent,
      unpriced,
      message,
      progress,
      statusText,
      announcement,
      label,
      runLive,
      classify,
      index,
      lanes,
      counts,
    ],
  );

  return <RunContext value={value}>{children}</RunContext>;
}

export function useRun(): RunApi {
  const api = useContext(RunContext);
  if (!api) throw new Error("useRun must be used inside <RunProvider>.");
  return api;
}
