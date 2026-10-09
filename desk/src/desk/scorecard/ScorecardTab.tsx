import { TICKETS } from "../../data/synthetic";
import { costByStep, formatSeconds, formatTokens, formatUsd, runCost, runLabel, useRun } from "../../run";
import { SourceLink } from "../ui/SourceLink";
import "./ScorecardTab.css";

/** Where the reference labels live in the repository. */
const REFERENCE_LABELS = "docs/eval/reference-labels.json";

/**
 * Model accuracy is not measured yet, and this tab says so rather than show a placeholder number.
 * What it can show truthfully is what this run cost, per step, computed from the traces.
 */
export function ScorecardTab() {
  const { run } = useRun();
  const rows = costByStep(run.steps);
  const total = runCost(run.steps);
  const unpriced = rows.some((r) => r.unpriced);
  const aiCalls = rows.reduce((n, r) => n + r.aiCalls, 0);
  const calls = rows.reduce((n, r) => n + r.calls, 0);

  return (
    <div>
      <section aria-labelledby="score-heading">
        <h3 id="score-heading" className="dk-h3">
          Model accuracy
        </h3>
        <p className="score-state">
          <strong>Not measured yet.</strong> No accuracy figure is shown until the check below has been run on a
          recorded AI run and the reference labels have been reviewed by a person.
        </p>
        <h4 className="dk-h4">Method</h4>
        <ol className="dk-list">
          <li>
            Reference answers for the {TICKETS.length} synthetic tickets are in{" "}
            <SourceLink path={REFERENCE_LABELS}>reference-labels.json</SourceLink>. Each field lists every acceptable
            answer, and where a reasonable support engineer could choose either of two, both are accepted.
          </li>
          <li>
            The model's triage of each ticket is compared field by field: component, severity, action and runbook. Every
            field is scored on its own, and a ticket counts as fully right only when all four match.
          </li>
          <li>
            The reference labels are a draft written from the ticket text, the runbook scopes and the severity guide. A
            person reviews them before any score is published.
          </li>
          <li>Cost per ticket is the cost of the triage step below divided by {TICKETS.length}, at list price.</li>
        </ol>
      </section>

      <section className="dk-section" aria-labelledby="cost-heading">
        <h3 id="cost-heading" className="dk-h3">
          Cost of this run
        </h3>
        <p className="dk-lede">
          {runLabel(run)}. {aiCalls} of {calls} calls were answered by a model.
          {total === 0 && !unpriced && " Nothing was spent: no call reported model usage."} Estimated at list price from
          the tokens each call reported.
        </p>
        <div className="dk-scroll">
          <table className="dk-table">
            <caption className="sr-only">Cost of this run, per step</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="dk-num">
                  Calls
                </th>
                <th scope="col">Model</th>
                <th scope="col">Tokens</th>
                <th scope="col" className="dk-num">
                  Time
                </th>
                <th scope="col" className="dk-num">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.step}>
                  <th scope="row">{r.label}</th>
                  <td className="dk-num">{r.calls}</td>
                  <td className="dk-mono score-model">{r.models.length ? r.models.join(", ") : "rules"}</td>
                  <td className="dk-mono">{formatTokens(r.tokens)}</td>
                  <td className="dk-num">{r.ms ? formatSeconds(r.ms) : "–"}</td>
                  <td className="dk-num">
                    {formatUsd(r.cost)}
                    {r.unpriced ? " +" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Whole run</th>
                <td className="dk-num">{calls}</td>
                <td />
                <td />
                <td />
                <td className="dk-num score-total">
                  {formatUsd(total)}
                  {unpriced ? " +" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="dk-note">
          Time for triage is the slowest of the {rows[0]?.calls} batches, which run in parallel.
          {unpriced && " A plus sign marks a call on a model with no list price, so that cost is a floor."}
        </p>
      </section>
    </div>
  );
}
