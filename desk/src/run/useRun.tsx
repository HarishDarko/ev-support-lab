// The React side of the Run model: a provider that holds the run, and the hook everything reads it through.
// The provider starts from the recorded run, so nothing waits on the network. `runLive()` re-runs the chain in
// the background and merges answers as they land.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useIncident } from "../incident";
import { classifyTicket } from "./classify";
import { chainSeconds, runLabel } from "./cost";
import { chainCalls, liveNote, mergeUpdate, postTo, runChain, triageBatches, type PostStep } from "./live";
import { EV_DESK, type DeskPack } from "./pack";
import { indexRun, laneCounts, lanesOf, type TicketResult } from "./selectors";
import type { LaneCounts } from "./guardrail";
import type { ClassifyModel, Lane, Run, RunSource, RunStatus, StepResult } from "./types";

export interface RunApi {
  /** The industry pack this run belongs to. */
  pack: DeskPack;
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
  /** `ai` counts the answers a model gave; the rest came from the rules. */
  progress: { settled: number; total: number; ai: number } | null;
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
  /** The industry pack. Defaults to EV charging; the incident comes from IncidentContext. */
  pack?: DeskPack;
}

/** The groups of steps a screen reader hears about, in the order they usually finish. */
const ANNOUNCED_GROUPS: [steps: string[], name: string][] = [
  [["triage"], "Triage"],
  [["patterns"], "Patterns"],
  [["investigate"], "The investigation"],
  [["handoff", "verify"], "The handoff and the verification reading"],
  [["kb", "classify", "shiftnote"], "The article, the new-ticket check and the shift note"],
];

export function RunProvider({ children, initial, post, pack = EV_DESK }: ProviderProps) {
  const incident = useIncident();
  const [run, setRun] = useState<Run>(() => initial ?? pack.recorded());
  const [status, setStatus] = useState<RunStatus>("idle");
  const [spent, setSpent] = useState(0);
  // Some live call ran on a model with no list price, so `spent` is a floor.
  const [unpriced, setUnpriced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunApi["progress"]>(null);
  const [announcement, setAnnouncement] = useState("");

  const postStep = useMemo(() => post ?? postTo(), [post]);
  const latest = useRef(run);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current = run;
  }, [run]);
  useEffect(() => () => controller.current?.abort(), []);

  const runLive = useCallback(async () => {
    // A pack with no reviewed recording has no live runs; the server refuses them too.
    if (busy.current || !pack.liveRuns) return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const total = chainCalls(pack);
    const batches = triageBatches(pack).length;
    setStatus("running");
    setMessage(null);
    setProgress({ settled: 0, total, ai: 0 });
    let ai = 0;
    setAnnouncement(`Live run started. It usually takes about ${chainSeconds(pack.recorded().steps)} seconds.`);
    const done = new Set<string>();
    let triageDone = 0;
    const report = await runChain({
      post: postStep,
      base: latest.current.steps,
      signal: abort.signal,
      pack,
      incident,
      onUpdate: (update) => {
        setRun((current) => mergeUpdate(current, update));
        if (update.outcome !== "failed") {
          setSpent((total) => total + update.result.trace.cost);
          if (update.result.trace.unpriced) setUnpriced(true);
        }
        if (update.outcome !== "failed" && update.result.trace.source === "ai") ai += 1;
        setProgress({ settled: update.settled, total, ai });
        if (update.step === "triage") triageDone += 1;
        else done.add(update.step);
        const finished = ANNOUNCED_GROUPS.find(
          ([steps]) =>
            steps.includes(update.step) && steps.every((s) => (s === "triage" ? triageDone === batches : done.has(s))),
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
  }, [postStep, pack, incident]);

  const classify = useCallback(
    async (text: string) => {
      const result = await classifyTicket(postStep, text, latest.current.steps.kb.data, undefined, pack);
      setSpent((total) => total + result.trace.cost);
      if (result.trace.unpriced) setUnpriced(true);
      return result;
    },
    [postStep, pack],
  );

  const index = useMemo(() => indexRun(run, pack), [run, pack]);
  const lanes = useMemo(() => lanesOf(index, pack), [index, pack]);
  const counts = useMemo(() => laneCounts(index), [index]);
  const label = runLabel(run);

  const value = useMemo<RunApi>(
    () => ({
      pack,
      run,
      source: run.source,
      status,
      spent,
      unpriced,
      message,
      progress,
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
      pack,
      run,
      status,
      spent,
      unpriced,
      message,
      progress,
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
