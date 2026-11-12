import { useIncident } from "../../incident";
import { blockClass, originOfStep, pillTone } from "../ui/origin";
import { provenanceOfStep, useRun } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import "./VerificationResult.css";

/** Day 20: what shipped, the canary and control results, the correctness checks, and the AI's cautious reading. */
export function VerificationResult() {
  const { run } = useRun();
  // The numbers come from the pack's lab (through its experiment seam), not from the original script.
  const { change, verification: v } = useIncident();
  const reading = run.steps.verify.data;
  const origin = originOfStep(run.steps.verify);
  const day = change.shippedDay + v.windowDays;

  return (
    <section className="dk-section" aria-labelledby="inc-verification">
      <p className="dk-kicker">
        Day {day} · {v.windowDays} days after the change shipped on day {change.shippedDay}
      </p>
      <h3 id="inc-verification" className="dk-h3">
        Verification
      </h3>
      <p className="dk-lede">{change.summary}</p>
      <p className="dk-note">
        <span className="dk-mono">{change.ref}</span> · {change.rollout}
      </p>

      <div className="dk-scroll">
        <table className="dk-table verify-table">
          <caption className="sr-only">{v.caption}</caption>
          <thead>
            <tr>
              {v.columns.map((c) => (
                <th key={c.label} scope="col" className={c.num ? "dk-num" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((g) => (
              <tr key={g.name}>
                <th scope="row">{g.name}</th>
                {g.cells.map((cell, i) => (
                  <td key={i} className={v.columns[i + 1]?.num ? "dk-num" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dk-note">{v.note}</p>

      {v.differences.length > 0 && (
        <p className="dk-note">
          The lab computed {v.differences.length === 1 ? "one value" : "some values"} differently from the original
          script: {v.differences.map((d) => `${d.metric} is ${d.computed}, the script said ${d.expected}`).join("; ")}.
          The numbers above are the lab's.
        </p>
      )}

      <h4 className="dk-h4">{v.checksTitle}</h4>
      <dl className="dk-dl">
        {v.checks.flatMap(([name, value]) => [
          <dt key={`${name}-t`}>{name}</dt>,
          <dd key={`${name}-d`} className="dk-mono">
            {value}
          </dd>,
        ])}
      </dl>

      <h4 className="dk-h4">The reading</h4>
      <div className={blockClass(origin)}>
        <p className="verify-verdict">
          <Pill tone={pillTone(origin)}>{reading.verdict}</Pill>
        </p>
        <p className="verify-reading">{reading.reading}</p>
      </div>
      <div className="verify-doesnt">
        <h4 className="dk-h4">What this does not prove</h4>
        <ul className="dk-list">
          {reading.what_it_does_not_prove.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <h4 className="dk-h4">Keep watching</h4>
      <ul className="dk-list">
        {reading.keep_watching.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h4 className="dk-h4">Next decision</h4>
      <p className="dk-lede">{reading.next_decision}</p>
      <ProvenanceNote provenance={provenanceOfStep(run.steps.verify)} step="verify" />
    </section>
  );
}
