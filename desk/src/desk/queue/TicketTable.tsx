import { useMemo } from "react";
import { pillTone } from "../ui/origin";
import { useRun, type Lane, type TicketResult } from "../../run";
import { Pill } from "../ui/Pill";
import "./TicketTable.css";

interface Props {
  rows: readonly string[];
  resultFor: (id: string) => TicketResult | undefined;
  selected: string;
  onSelect: (id: string) => void;
}

/** The tickets in a dense table, one row each. The ID is the button that selects the row. */
export function TicketTable({ rows, resultFor, selected, onSelect }: Props) {
  const { pack } = useRun();
  const ticketById = useMemo(() => new Map(pack.tickets.map((t) => [t.id, t])), [pack]);
  // The pack's two short columns (for EV: site and firmware). The class names set which one hides on a phone.
  const [first, second] = pack.columns;
  return (
    <div className="dk-scroll tickets-scroll">
      <table className="dk-table tickets">
        <caption className="sr-only">Open tickets with the triage decision for each</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col" className="tickets-from">
              Source
            </th>
            <th scope="col" className="tickets-site">
              {first.label}
            </th>
            <th scope="col" className="tickets-fw">
              {second.label}
            </th>
            <th scope="col">Lane</th>
            <th scope="col" className="tickets-component">
              Component
            </th>
            <th scope="col">Sev</th>
            <th scope="col">Runbook</th>
            <th scope="col">Provenance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => {
            const ticket = ticketById.get(id);
            if (!ticket) return null;
            const entry = resultFor(id);
            return (
              <tr key={id} className={id === selected ? "tickets-row tickets-row--selected" : "tickets-row"}>
                <th scope="row">
                  <button
                    type="button"
                    className="tickets-id"
                    aria-pressed={id === selected}
                    onClick={() => onSelect(id)}
                  >
                    {id}
                  </button>
                </th>
                <td className="tickets-from">{ticket.from}</td>
                <td className="tickets-site dk-mono">{first.value(ticket)}</td>
                <td className="tickets-fw dk-mono">{second.value(ticket)}</td>
                <td>{entry ? <LaneCell lane={entry.lane} label={entry.laneLabel} /> : <span>Not triaged</span>}</td>
                <td className="tickets-component dk-mono">{entry?.result.component ?? "–"}</td>
                <td className="dk-mono">{entry?.result.severity ?? "–"}</td>
                <td className="dk-mono">{entry && entry.result.runbook !== "none" ? entry.result.runbook : "–"}</td>
                <td>
                  {entry && (
                    <Pill tone={pillTone(entry.provenance.origin)}>
                      {entry.provenance.origin === "ai" ? "AI" : "Rules"}
                      <span className="sr-only">{entry.provenance.origin === "ai" ? ", checked" : " fallback"}</span>
                    </Pill>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LaneCell({ lane, label }: { lane: Lane; label: string }) {
  return (
    <span className={`lane lane--${lane}`}>
      <span className="lane-mark" aria-hidden="true" />
      {label}
    </span>
  );
}
