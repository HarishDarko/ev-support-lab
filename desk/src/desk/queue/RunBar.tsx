import { liveSpendText, originCounts, formatUsd, useRun, indexRun } from "../../run";
import { useMemo } from "react";
import { TICKETS } from "../../data/synthetic";
import "./RunBar.css";

/** What this run is, who decided the tickets, and the "Run it live" button. */
export function RunBar() {
  const { run, label, source, status, spent, unpriced, message, progress, runLive } = useRun();
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
        <p className="runbar-status" role="status" aria-live="polite">
          {running && progress
            ? `${liveSpendText(spent, unpriced)} · ${progress.settled} of ${progress.total} calls`
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
