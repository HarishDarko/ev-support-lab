import { useCallback, useEffect, useState } from "react";
import { STAGES } from "../stages";
import { BEATS, firstBeatOf, type Beat, type Decisions } from "./beats";

const stageFromHash = (): number => {
  const id = window.location.hash.slice(1);
  const stage = STAGES.find((s) => s.id === id);
  return stage ? Math.max(0, firstBeatOf(stage.id)) : 0;
};

export interface Story {
  index: number;
  beat: Beat;
  stageIndex: number;
  decisions: Decisions;
  next: () => void;
  back: () => void;
  goStage: (stageIndex: number) => void;
  /** Approves these closures (the ones approvable now). */
  approve: (ids: string[]) => void;
  /** Records that a person checked (or unchecked) the meter for a ticket. */
  confirmMeter: (id: string, checked: boolean) => void;
  send: () => void;
}

/**
 * Where the walkthrough is, and what the person has decided. The URL hash names the stage, so a link can
 * open one; arrows and Next/Back move one beat at a time.
 */
export function useStory(keysEnabled: boolean): Story {
  const [index, setIndex] = useState(stageFromHash);
  const [decisions, setDecisions] = useState<Decisions>({ approvedIds: [], sent: false, meterChecked: [] });

  const go = useCallback((i: number) => setIndex(Math.min(BEATS.length - 1, Math.max(0, i))), []);
  const next = useCallback(() => setIndex((i) => Math.min(BEATS.length - 1, i + 1)), []);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goStage = useCallback((s: number) => go(firstBeatOf(STAGES[s]!.id)), [go]);

  const beat = BEATS[index]!;
  const stageIndex = STAGES.findIndex((s) => s.id === beat.stage);

  // Keep the hash on the current stage without adding a history entry per beat.
  useEffect(() => {
    const hash = `#${beat.stage}`;
    if (window.location.hash !== hash) history.replaceState(null, "", hash);
  }, [beat.stage]);

  useEffect(() => {
    const onHash = () => setIndex(stageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysEnabled, next, back]);

  const approve = useCallback(
    (ids: string[]) => setDecisions((d) => ({ ...d, approvedIds: [...new Set([...d.approvedIds, ...ids])] })),
    [],
  );
  const confirmMeter = useCallback(
    (id: string, checked: boolean) =>
      setDecisions((d) => ({
        ...d,
        meterChecked: checked ? [...new Set([...d.meterChecked, id])] : d.meterChecked.filter((x) => x !== id),
        // Unchecking the meter withdraws an approval that depended on it.
        approvedIds: checked ? d.approvedIds : d.approvedIds.filter((x) => x !== id),
      })),
    [],
  );
  const send = useCallback(() => setDecisions((d) => ({ ...d, sent: true })), []);

  return { index, beat, stageIndex, decisions, next, back, goStage, approve, confirmMeter, send };
}
