import { chainSeconds, liveSpendText, originCounts, formatUsd, recordedRun, useRun, indexRun } from "../../run";
import { useMemo } from "react";
import { TICKETS } from "../../data/synthetic";
import "./RunBar.css";

/** What this run is, who decided the tickets, and the "Run it live" button. */
export function RunBar() {
  const { run, label, source, status, spent, unpriced, message, progress, announcement, runLive } = useRun();
  const who = useMemo(() => originCounts(indexRun(run)), [run]);
  const running = status === "running";

  return (
    <div className="runbar">
      <div className="runbar-text">
        <p className="runbar-label">{label}</p>
        <p className="runbar-summary">
          {TICKETS.length} tickets triaged: <span className="dk-mono">{who.ai}</span> by the AI, checked;{" "}
          <span className="dk-mono">{who.rules}</span> by the rules fallback
          {source === "recorded" && (
            <>
              . Recorded cost <span className="dk-mono">{formatUsd(run.recording.totalCost)}</span>
            </>
          )}
        </p>
      </div>
      <div className="runbar-action">
        <button type="button" className="dk-button" onClick={() => void runLive()} disabled={running}>
          {running ? "Running live" : "Run it live"}
        </button>
        {/* The visible line updates on every answer; screen readers hear only the start, each finished group and the end. */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        <p className="runbar-status">
          {running && progress
            ? progress.settled > 0 && progress.ai === 0
              ? `No model has answered yet; the rules are answering: ${progress.settled} of ${progress.total} answers in. ${liveSpendText(spent, unpriced)}`
              : `Asking the model: ${progress.settled} of ${progress.total} answers in, usually about ${chainSeconds(recordedRun().steps)} seconds in all. ${liveSpendText(spent, unpriced)}`
            : source === "live" || spent > 0
              ? liveSpendText(spent, unpriced)
              : ""}
        </p>
      </div>
      {message && (
        <p className="runbar-note" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
