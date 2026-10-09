import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, Ref } from "react";
import type { RunApi } from "../run";
import { STAGES } from "../stages";
import { BEATS, type Beat, type Facts } from "../story/beats";
import { DUR, EASE } from "../board/motion";
import "./Stage.css";

interface ClaimProps {
  beat: Beat;
  f: Facts;
  stageIndex: number;
  onApprove: () => void;
  onSend: () => void;
  /** Anything the beat adds under its lede, such as the run control at triage. */
  extra?: ReactNode;
}

/** Kicker, one headline, one lede, and the beat's single primary action when it has one. */
export function Claim({ beat, f, stageIndex, onApprove, onSend, extra }: ClaimProps) {
  const stage = STAGES[stageIndex]!;
  const claim = beat.claim(f);
  return (
    <header className="claim">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={beat.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.base, ease: EASE }}
        >
          <p className="claim-kicker">
            {stageIndex + 1} · {stage.name} <span aria-hidden="true">·</span> {beat.when(f)}
          </p>
          <h1 className="claim-text">{claim}</h1>
          <p className="claim-lede">{beat.lede(f)}</p>
          {extra}
          {beat.action === "approve" && (
            <Action
              done={f.approved}
              onClick={onApprove}
              label={`Approve ${f.approvable.length} closures`}
              doneLabel="Approved"
            />
          )}
          {beat.action === "send" && (
            <Action done={f.sent} onClick={onSend} label="Approve and send" doneLabel="Sent · simulated" />
          )}
        </motion.div>
      </AnimatePresence>
      <p className="sr-only" role="status" aria-live="polite">
        {`Stage ${stageIndex + 1} of ${STAGES.length}, ${stage.name}: ${claim}`}
      </p>
    </header>
  );
}

function Action({
  done,
  onClick,
  label,
  doneLabel,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
  doneLabel: string;
}) {
  return (
    <p className="claim-action">
      <button type="button" className={done ? "btn btn--done" : "btn btn--primary"} onClick={onClick} disabled={done}>
        {done ? `✓ ${doneLabel}` : label}
      </button>
    </p>
  );
}

interface BarProps {
  index: number;
  /** The beat's own action is still open, so Next steps back to a plain button. */
  actionPending: boolean;
  onBack: () => void;
  onNext: () => void;
  onDesk: () => void;
  deskRef?: Ref<HTMLButtonElement>;
}

/** Back · where you are · Open the desk · Next. Fixed to the bottom, never over content. */
export function ControlBar({ index, actionPending, onBack, onNext, onDesk, deskRef }: BarProps) {
  const beat = BEATS[index]!;
  const next = BEATS[index + 1];
  const inStage = BEATS.filter((b) => b.stage === beat.stage);
  const pos = inStage.findIndex((b) => b.id === beat.id);
  const stage = STAGES.find((s) => s.id === beat.stage)!;
  const nextStage = next && next.stage !== beat.stage ? STAGES.find((s) => s.id === next.stage) : undefined;
  return (
    <nav className="bar" aria-label="Walkthrough">
      <button type="button" className="btn" onClick={onBack} disabled={index === 0}>
        <span aria-hidden="true">←</span> Back
      </button>
      <p className="bar-where">
        <span className="bar-stage">{stage.name}</span>
        <span className="bar-dots" role="img" aria-label={`Step ${pos + 1} of ${inStage.length}`}>
          {inStage.map((b, i) => (
            <span key={b.id} className={i <= pos ? "dot dot--on" : "dot"} />
          ))}
        </span>
      </p>
      <span className="bar-end">
        <button ref={deskRef} type="button" className="btn" onClick={onDesk} aria-keyshortcuts="D">
          Open the desk <kbd>D</kbd>
        </button>
        <button type="button" className={actionPending ? "btn" : "btn btn--next"} onClick={onNext} disabled={!next}>
          {next ? (nextStage ? `Next: ${nextStage.name}` : "Next") : "The end"} <span aria-hidden="true">→</span>
        </button>
      </span>
    </nav>
  );
}

/** Where the AI answers on the board came from, and the one way to run them again live. */
export function RunControl({ api }: { api: RunApi }) {
  const running = api.status === "running";
  return (
    <div className="run-control">
      <p className="run-label">
        <span className="mono">{api.label}</span>
        {api.progress && (
          <span className="muted">
            {" "}
            · {api.progress.settled} of {api.progress.total} calls answered
          </span>
        )}
      </p>
      <button type="button" className="btn btn--small" onClick={() => void api.runLive()} disabled={running}>
        {running ? "Running live…" : "Run it live"}
      </button>
      {api.message && (
        <p className="run-message" role="status">
          {api.message}
        </p>
      )}
    </div>
  );
}
