import { useState } from "react";
import { TICKETS } from "../../data/synthetic";
import { LANE_LABEL, LANES, useRun, type Lane } from "../../run";
import { Inspector } from "./Inspector";
import { RunBar } from "./RunBar";
import { TicketTable } from "./TicketTable";
import { useDeskTicket } from "../focus";
import "./QueueTab.css";

type Filter = Lane | "all";

/** The console: every ticket with its decision, and an inspector for the selected one. */
export function QueueTab() {
  const { lanes, counts, lane, resultFor } = useRun();
  const [filter, setFilter] = useState<Filter>("all");
  // Open on the ticket the desk was opened for, else the first held ticket: the one the repeat rule is about.
  const asked = useDeskTicket();
  const [selected, setSelected] = useState(() => asked ?? lanes.held[0] ?? TICKETS[0]?.id ?? "");

  // Under 1000 px the inspector sits below the table, so bring it into view.
  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 999px)").matches)
      document.getElementById("queue-inspector")?.scrollIntoView({ block: "nearest" });
  };

  const rows = TICKETS.map((t) => t.id).filter((id) => filter === "all" || lane(id) === filter);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: TICKETS.length },
    ...LANES.map((id) => ({ id, label: LANE_LABEL[id], count: counts[id] })),
  ];

  return (
    <section aria-labelledby="queue-heading">
      <h3 id="queue-heading" className="dk-h3">
        Queue
      </h3>
      <RunBar />
      <div className="queue-filters" role="group" aria-label="Show tickets in a lane">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="queue-filter"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="dk-mono">{f.count}</span>
          </button>
        ))}
      </div>
      <div className="queue-layout">
        <div className="queue-table">
          <TicketTable rows={rows} resultFor={resultFor} selected={selected} onSelect={select} />
          <p className="dk-note" role="status">
            Showing {rows.length} of {TICKETS.length} tickets. All data is synthetic.
          </p>
        </div>
        <Inspector entry={resultFor(selected)} />
      </div>
    </section>
  );
}
