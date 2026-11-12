import { useIncident } from "../../incident";
import { cellClass } from "./cells";
import { Pill } from "../ui/Pill";
import "./Containment.css";

/** What support does while engineering works: correct the records, and run the read-only detector. */
export function Containment() {
  const { containment, detector } = useIncident();

  return (
    <section className="dk-section" aria-labelledby="inc-containment">
      <h3 id="inc-containment" className="dk-h3">
        {containment.title}
      </h3>
      <ul className="dk-list">
        {containment.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h4 className="dk-h4">{detector.title}</h4>
      <p className="dk-note">{detector.note}</p>
      <code className="detector-query dk-mono">{detector.query}</code>
      <div className="dk-scroll">
        <table className="dk-table">
          <caption className="sr-only">{detector.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{detector.idLabel}</th>
              {detector.columns.map((c) => (
                <th key={c.label} scope="col" className={c.num ? "dk-num" : undefined}>
                  {c.label}
                </th>
              ))}
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {detector.rows.map(({ id, cells, candidate, reason }) => (
              <tr key={id}>
                <th scope="row" className="dk-mono">
                  {id}
                </th>
                {cells.map((c, i) => (
                  <td key={i} className={cellClass(c)}>
                    {c.text}
                  </td>
                ))}
                <td>
                  {candidate ? <Pill tone="attn">Candidate</Pill> : <Pill>No hit</Pill>} {reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dk-note">{detector.summary}</p>
    </section>
  );
}
