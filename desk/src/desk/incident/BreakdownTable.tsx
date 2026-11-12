import { useIncident } from "../../incident";
import { cellClass } from "./cells";
import "./BreakdownTable.css";

/** The incident's breakdown table (for EV: the 21-day fleet view by firmware line). Denominators stay visible. */
export function BreakdownTable() {
  const { title, lede, caption, columns, rows } = useIncident().breakdown;
  return (
    <section className="dk-section" aria-labelledby="inc-fleet">
      <h3 id="inc-fleet" className="dk-h3">
        {title}
      </h3>
      <p className="dk-lede">{lede}</p>
      <div className="dk-scroll">
        <table className="dk-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} scope="col" className={c.num ? "dk-num" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, cells: [head, ...cells] }) => (
              <tr key={key}>
                <th scope="row" className={head?.mono ? "dk-mono" : undefined}>
                  {head?.text}
                </th>
                {cells.map((c, i) =>
                  c.bar == null ? (
                    <td key={i} className={cellClass(c)}>
                      {c.text}
                    </td>
                  ) : (
                    <td key={i}>
                      <span className="fleet-rate">
                        <span className="fleet-track" aria-hidden="true">
                          <span className="fleet-bar" style={{ width: `${c.bar}%` }} />
                        </span>
                        <span className="dk-mono">{c.text}</span>
                      </span>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
