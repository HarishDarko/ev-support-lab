import { LayoutGroup } from "motion/react";
import { useEffect, useRef } from "react";
import { STAGES } from "../stages";
import { BEATS, type Beat, type Facts } from "../story/beats";
import type { StoryData } from "../story/data";
import { Focus } from "../board/Board";
import "../board/Board.css";
import "./PhoneStory.css";

interface Props {
  data: StoryData;
  f: Facts;
  onApprove: () => void;
  onSend: () => void;
  onDesk: (beat: Beat) => void;
  /** Reports the stage in view, so the top strip can follow the reader. */
  onStageInView: (stageIndex: number) => void;
  /** A stage the reader asked for from the top strip; scrolled into view when it changes. */
  jumpTo: { stageIndex: number; n: number } | null;
}

/**
 * Under 1000 px the walkthrough is one scrolling page: every beat in order, its board state at rest.
 * Nothing waits on scroll position to become visible.
 * Each section has its own layout group so the shared ids that animate on desktop stay separate here.
 */
export function PhoneStory({ data, f, onApprove, onSend, onDesk, onStageInView, jumpTo }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const stage = (visible?.target as HTMLElement | undefined)?.dataset.stage;
        const i = STAGES.findIndex((s) => s.id === stage);
        if (i >= 0) onStageInView(i);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    el.querySelectorAll("[data-stage]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [onStageInView]);

  useEffect(() => {
    if (!jumpTo) return;
    const id = STAGES[jumpTo.stageIndex]?.id;
    root.current?.querySelector(`[data-first-of="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpTo]);

  return (
    <div ref={root} className="phone">
      <h1 className="sr-only">One support shift, step by step</h1>
      {BEATS.map((beat, i) => {
        const first = BEATS[i - 1]?.stage !== beat.stage;
        const stageIndex = STAGES.findIndex((s) => s.id === beat.stage);
        return (
          <section
            key={beat.id}
            className="phone-beat"
            data-stage={beat.stage}
            data-first-of={first ? beat.stage : undefined}
            aria-labelledby={`claim-${beat.id}`}
          >
            <p className="claim-kicker">
              {stageIndex + 1} · {STAGES[stageIndex]!.name} <span aria-hidden="true">·</span> {beat.when(f)}
            </p>
            <h2 id={`claim-${beat.id}`} className="phone-claim">
              {beat.claim(f)}
            </h2>
            <p className="claim-lede">{beat.lede(f)}</p>
            {beat.action === "approve" && (
              <PhoneAction
                done={f.approved}
                onClick={onApprove}
                label={`Approve ${f.approvable.length} closures`}
                doneLabel="Approved"
              />
            )}
            {beat.action === "send" && (
              <PhoneAction done={f.sent} onClick={onSend} label="Approve and send" doneLabel="Sent · simulated" />
            )}
            <div className="phone-board">
              <LayoutGroup id={beat.id}>
                <Focus beat={beat.id} data={data} f={f} onOpenTicket={() => onDesk(beat)} />
              </LayoutGroup>
            </div>
            <p className="phone-desk">
              <button type="button" className="btn" onClick={() => onDesk(beat)}>
                Open the desk
              </button>
            </p>
          </section>
        );
      })}
    </div>
  );
}

function PhoneAction(props: { done: boolean; onClick: () => void; label: string; doneLabel: string }) {
  return (
    <p className="claim-action">
      <button
        type="button"
        className={props.done ? "btn btn--done" : "btn btn--primary"}
        onClick={props.onClick}
        disabled={props.done}
      >
        {props.done ? `✓ ${props.doneLabel}` : props.label}
      </button>
    </p>
  );
}
