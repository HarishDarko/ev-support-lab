import { useIncident } from "../../incident";
import "./TimingTable.css";

/** One row per ticket in the incident, sorted by value (for EV: seconds from unplug to connection drop). */
export function TimingTable() {
  const timing = useIncident().timing;
  const rows = [...timing.rows].sort((a, b) => a.value - b.value);
  return (
    <section className="dk-section" aria-labelledby="inc-timing">
      <h3 id="inc-timing" className="dk-h3">
        {timing.title}
      </h3>
      <p className="dk-lede">{timing.lede}</p>
      <div className="dk-scroll">
        <table className="dk-table timing">
          <caption className="sr-only">{timing.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{timing.idLabel}</th>
              <th scope="col">{timing.groupLabel}</th>
              <th scope="col" className="dk-num">
                {timing.valueLabel}
              </th>
              <th scope="col">
                <span className="sr-only">{timing.axisLabel}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="dk-mono">
                  {row.id}
                </th>
                <td className="dk-mono">{row.group}</td>
                <td className="dk-num">{row.value}</td>
                <td className="timing-axis" aria-hidden="true">
                  <span className="timing-bar" style={{ width: `${(row.value / timing.axisMax) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
