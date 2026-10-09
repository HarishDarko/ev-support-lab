import { DROP_WINDOW_SECONDS, fastestDropSec, slowestDropSec, sortedTimings } from "./evidence";
import "./TimingTable.css";

/** One row per stuck session: how many seconds after the unplug the charger's websocket dropped. */
export function TimingTable() {
  const rows = sortedTimings();
  return (
    <section className="dk-section" aria-labelledby="inc-timing">
      <h3 id="inc-timing" className="dk-h3">
        Seconds from unplug to connection drop
      </h3>
      <p className="dk-lede">
        All {rows.length} stuck sessions dropped between {fastestDropSec()} and {slowestDropSec()} seconds after the
        driver unplugged. The bar runs to {DROP_WINDOW_SECONDS} s.
      </p>
      <div className="dk-scroll">
        <table className="dk-table timing">
          <caption className="sr-only">Stuck sessions by seconds from unplug to websocket drop</caption>
          <thead>
            <tr>
              <th scope="col">Ticket</th>
              <th scope="col">Firmware</th>
              <th scope="col" className="dk-num">
                Seconds
              </th>
              <th scope="col">
                <span className="sr-only">Position on the 0 to {DROP_WINDOW_SECONDS} second axis</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="dk-mono">
                  {row.id}
                </th>
                <td className="dk-mono">{row.fw}</td>
                <td className="dk-num">{row.s}</td>
                <td className="timing-axis" aria-hidden="true">
                  <span className="timing-bar" style={{ width: `${(row.s / DROP_WINDOW_SECONDS) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
