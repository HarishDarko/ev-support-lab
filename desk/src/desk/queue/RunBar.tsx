import { NO_LIVE_RUNS, liveSpendText, originCounts, formatUsd, useRun, indexRun } from "../../run";
import { useMemo } from "react";
import "./RunBar.css";

/** What this run is, who decided the tickets, and the "Run it live" button. */
export function RunBar() {
  const { pack, run, label, source, status, spent, unpriced, message, statusText, announcement, runLive } = useRun();
  const who = useMemo(() => originCounts(indexRun(run, pack)), [run, pack]);
  const running = status === "running";

  return (
    <div className="runbar">
      <div className="runbar-text">
        <p className="runbar-label">{label}</p>
        <p className="runbar-summary">
          {pack.tickets.length} tickets triaged: <span className="dk-mono">{who.ai}</span> by the AI, checked;{" "}
          <span className="dk-mono">{who.rules}</span> by the rules fallback
          {source === "recorded" && (
            <>
              . Recorded cost <span className="dk-mono">{formatUsd(run.recording.totalCost)}</span>
            </>
          )}
        </p>
      </div>
      <div className="runbar-action">
        {pack.liveRuns ? (
          <button type="button" className="dk-button" onClick={() => void runLive()} disabled={running}>
            {running ? "Running live" : "Run it live"}
          </button>
        ) : (
          <p className="runbar-status">{NO_LIVE_RUNS}</p>
        )}
        {/* The visible line updates on every answer; screen readers hear only the start, each finished group and the end. */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        <p className="runbar-status">
          {running ? statusText : source === "live" || spent > 0 ? liveSpendText(spent, unpriced) : ""}
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
