import { experiment } from "../../data/experiment";
import { ENGINEERING_CHANGE } from "../../data/synthetic";
import { blockClass, originOfStep, pillTone } from "../ui/origin";
import { provenanceOfStep, useRun } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import "./VerificationResult.css";

/** Day 20: what shipped, the canary and control results, the correctness checks, and the AI's cautious reading. */
export function VerificationResult() {
  const { run } = useRun();
  // The numbers come from the lab's own run (through the experiment seam), not from the original script.
  const v = experiment.verification;
  const c = v.correctness;
  const reading = run.steps.verify.data;
  const origin = originOfStep(run.steps.verify);
  const day = ENGINEERING_CHANGE.shippedDay + v.windowDays;
  const groups = [
    { name: "Canary (fix on)", sites: v.canary.sites, before: v.canary.before, after: v.canary.after },
    { name: "Control (fix off)", sites: v.control.sites, before: v.control.before, after: v.control.after },
  ];
  const checks: [string, string][] = [
    ["Closed a transaction still delivering energy", String(c.falseClosures)],
    ["Skipped because a newer transaction had started", String(c.newerTransactionSkips)],
    ["Late Ended events applied once", `${c.lateEndedApplied} of ${c.lateEndedArrived}`],
    ["Duplicate charges", String(c.duplicateCharges)],
    ["Provisional invoices reviewed / adjusted", `${c.invoicesReviewed} / ${c.invoicesAdjusted}`],
  ];

  return (
    <section className="dk-section" aria-labelledby="inc-verification">
      <p className="dk-kicker">
        Day {day} · {v.windowDays} days after the change shipped on day {ENGINEERING_CHANGE.shippedDay}
      </p>
      <h3 id="inc-verification" className="dk-h3">
        Verification
      </h3>
      <p className="dk-lede">{ENGINEERING_CHANGE.summary}</p>
      <p className="dk-note">
        <span className="dk-mono">{ENGINEERING_CHANGE.ref}</span> · {ENGINEERING_CHANGE.rollout}
      </p>

      <div className="dk-scroll">
        <table className="dk-table verify-table">
          <caption className="sr-only">
            Stuck sessions in the {v.windowDays} days before and after, canary and control
          </caption>
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col" className="dk-num">
                Sites
              </th>
              <th scope="col" className="dk-num">
                Stuck before
              </th>
              <th scope="col" className="dk-num">
                Stuck after
              </th>
              <th scope="col" className="dk-num">
                Drops near unplug, before / after
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.name}>
                <th scope="row">{g.name}</th>
                <td className="dk-num">{g.sites}</td>
                <td className="dk-num">{g.before.stuck}</td>
                <td className="dk-num">{g.after.stuck}</td>
                <td className="dk-num">
                  {g.before.dropsNearUnplug} / {g.after.dropsNearUnplug}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dk-note">
        On the canary sites {v.canary.after.closedByReconciliation} sessions were closed by reconciliation. Of{" "}
        {c.canarySessions.toLocaleString("en-US")} sessions, only {c.reconciled} needed reconciling and{" "}
        {c.lateEndedArrived} had a late Ended event. Those few cases are what exercised the change.
      </p>

      {experiment.differences.length > 0 && (
        <p className="dk-note">
          The lab computed {experiment.differences.length === 1 ? "one value" : "some values"} differently from the
          original script:{" "}
          {experiment.differences.map((d) => `${d.metric} is ${d.computed}, the script said ${d.expected}`).join("; ")}.
          The numbers above are the lab's.
        </p>
      )}

      <h4 className="dk-h4">Correctness on the canary sites</h4>
      <dl className="dk-dl">
        {checks.flatMap(([name, value]) => [
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
