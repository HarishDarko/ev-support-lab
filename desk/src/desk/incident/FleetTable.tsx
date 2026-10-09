import { HERO } from "../../data/synthetic";
import { DROP_WINDOW_SECONDS, stuckShare } from "./evidence";
import "./FleetTable.css";

/** The 21-day fleet view by firmware line. The denominators stay visible: 12 of 19, not 63%. */
export function FleetTable() {
  return (
    <section className="dk-section" aria-labelledby="inc-fleet">
      <h3 id="inc-fleet" className="dk-h3">
        Fleet view, last {-HERO.firstSeenDay} days
      </h3>
      <p className="dk-lede">
        A websocket drop within {DROP_WINDOW_SECONDS} seconds of unplug, and how many of those left a session stuck.
        Drops at other times left none stuck.
      </p>
      <div className="dk-scroll">
        <table className="dk-table">
          <caption className="sr-only">Sessions, connection drops and stuck sessions by firmware line</caption>
          <thead>
            <tr>
              <th scope="col">Firmware</th>
              <th scope="col" className="dk-num">
                Sessions
              </th>
              <th scope="col" className="dk-num">
                Drops near unplug
              </th>
              <th scope="col">Ended stuck</th>
              <th scope="col" className="dk-num">
                Drops at other times
              </th>
            </tr>
          </thead>
          <tbody>
            {HERO.fleet.map((row) => (
              <tr key={row.fw}>
                <th scope="row" className="dk-mono">
                  {row.fw}
                </th>
                <td className="dk-num">{row.sessions.toLocaleString("en-US")}</td>
                <td className="dk-num">{row.dropsNearUnplug}</td>
                <td>
                  <span className="fleet-rate">
                    <span className="fleet-track" aria-hidden="true">
                      <span className="fleet-bar" style={{ width: `${stuckShare(row)}%` }} />
                    </span>
                    <span className="dk-mono">
                      {row.stuck} of {row.dropsNearUnplug}
                    </span>
                  </span>
                </td>
                <td className="dk-num">
                  {row.dropsElsewhere}
                  {row.stuckFromElsewhere === 0 ? " · none stuck" : ` · ${row.stuckFromElsewhere} stuck`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
