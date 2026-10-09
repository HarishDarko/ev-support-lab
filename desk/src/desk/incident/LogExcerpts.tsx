import { HERO } from "../../data/synthetic";
import { logFlag, type LogFlag } from "./evidence";
import "./LogExcerpts.css";

const FLAG_NOTE: Record<Exclude<LogFlag, null>, string> = {
  dropped: "connection dropped",
  missing: "no Ended received",
  ignored: "Ended ignored by the backend",
};

/** Every log excerpt in full, as the backend gateway summarised it. Synthetic OCPP 2.0.1. */
export function LogExcerpts() {
  return (
    <section className="dk-section" aria-labelledby="inc-logs">
      <h3 id="inc-logs" className="dk-h3">
        Gateway logs
      </h3>
      <p className="dk-lede">
        Synthetic OCPP 2.0.1 excerpts as the backend gateway summarised them, not full payloads. Charger-side logs are
        not available to support. Flagged lines are where the backend dropped, or never received, the Ended.
      </p>
      {HERO.logs.map((log) => (
        <figure key={log.title} className="gw-log">
          <figcaption className="log-title dk-mono">{log.title}</figcaption>
          <div className="dk-scroll">
            <table className="dk-table log-table">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {log.lines.map(([time, actor, detail], i) => {
                  const flag = logFlag(detail);
                  return (
                    <tr key={i} className={flag ? `log-line log-line--${flag}` : "log-line"}>
                      <td className="dk-mono">{time}</td>
                      <td className="dk-mono">{actor}</td>
                      <td className="dk-mono">
                        {detail}
                        {flag && <span className="log-flag"> ({FLAG_NOTE[flag]})</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </figure>
      ))}
    </section>
  );
}
