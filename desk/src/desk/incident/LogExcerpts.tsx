import { useIncident } from "../../incident";
import "./LogExcerpts.css";

/** Every log excerpt in full, as the pack's systems summarised them. Synthetic. */
export function LogExcerpts() {
  const { title, lede, excerpts, flag: flagOf } = useIncident().logs;
  return (
    <section className="dk-section" aria-labelledby="inc-logs">
      <h3 id="inc-logs" className="dk-h3">
        {title}
      </h3>
      <p className="dk-lede">{lede}</p>
      {excerpts.map((log) => (
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
                  const flag = flagOf(detail);
                  return (
                    <tr key={i} className={flag ? `log-line log-line--${flag.kind}` : "log-line"}>
                      <td className="dk-mono">{time}</td>
                      <td className="dk-mono">{actor}</td>
                      <td className="dk-mono">
                        {detail}
                        {flag && <span className="log-flag"> ({flag.note})</span>}
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
