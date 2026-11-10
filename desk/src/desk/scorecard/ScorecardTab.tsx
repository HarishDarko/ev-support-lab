import { TICKETS } from "../../data/synthetic";
import { costByStep, formatSeconds, formatTokens, formatUsd, runCost, runLabel, useRun } from "../../run";
import {
  LABELS_REVIEWED,
  REFERENCE_LABELS,
  SCORE_FIELDS,
  historyCheck,
  rulesAnswers,
  scoreTriage,
  triageAnswers,
  wilson95,
  type ScoreField,
} from "../../run/score";
import { SourceLink } from "../ui/SourceLink";
import "./ScorecardTab.css";

/** Where the reference labels live in the repository. */
const REFERENCE_LABELS_PATH = "docs/eval/reference-labels.json";

const FIELD_LABEL: Record<ScoreField, string> = {
  component: "Component",
  severity: "Severity",
  action: "Action",
  runbook: "Runbook",
};

// The rules and the closed tickets are fixed data, so these are computed once.
const RULES_LENIENT = scoreTriage(REFERENCE_LABELS, rulesAnswers());
const RULES_STRICT = scoreTriage(REFERENCE_LABELS, rulesAnswers(), "strict");
const HISTORY_CHECK = historyCheck();

const share = (k: number, n: number) => (n ? `${k} of ${n} (${Math.round((100 * k) / n)}%)` : "–");

/**
 * Triage accuracy for the run on screen and for the keyword rules, scored against the reviewed reference labels,
 * with the rules' check on older tickets they were not written from. Then what this run cost, per step.
 */
export function ScorecardTab() {
  const { run } = useRun();
  const answers = triageAnswers(run);
  const lenient = scoreTriage(REFERENCE_LABELS, answers);
  const strict = scoreTriage(REFERENCE_LABELS, answers, "strict");
  // Tickets where the model's answer failed a check and the rules answered instead; they count in this run's column.
  const fallbacks = run.steps.triage
    .flatMap((b) => b.data.results)
    .filter((r) => r.source === "rules")
    .map((r) => r.id);
  const [runLow, runHigh] = wilson95(lenient.allFour, lenient.n);
  const [rulesLow, rulesHigh] = wilson95(RULES_LENIENT.allFour, RULES_LENIENT.n);
  const overlap = runLow <= rulesHigh && rulesLow <= runHigh;
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
        <p className="dk-lede">
          How well this run triaged the {TICKETS.length} tickets, scored against reference labels reviewed on{" "}
          {LABELS_REVIEWED}, next to the keyword rules the desk falls back to. A ticket is fully right only when all
          four fields match.
        </p>
        <div className="dk-scroll">
          <table className="dk-table">
            <caption className="sr-only">Triage accuracy against the reviewed labels</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col" className="dk-num">
                  This run
                </th>
                <th scope="col" className="dk-num">
                  Keyword rules
                </th>
              </tr>
            </thead>
            <tbody>
              {SCORE_FIELDS.map((f) => (
                <tr key={f}>
                  <th scope="row">{FIELD_LABEL[f]}</th>
                  <td className="dk-num">{share(lenient.fields[f], lenient.n)}</td>
                  <td className="dk-num">{share(RULES_LENIENT.fields[f], RULES_LENIENT.n)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All four right</th>
                <td className="dk-num">{share(lenient.allFour, lenient.n)}</td>
                <td className="dk-num">{share(RULES_LENIENT.allFour, RULES_LENIENT.n)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="dk-note">
          Where the labels accept two answers, either counts. Counting only the reviewers&apos; majority answer, this
          run is fully right on {share(strict.allFour, strict.n)} tickets and the rules on{" "}
          {share(RULES_STRICT.allFour, RULES_STRICT.n)}.
          {fallbacks.length > 0 &&
            ` This run's column includes ${fallbacks.length} ticket${fallbacks.length > 1 ? "s" : ""} (${fallbacks.join(", ")}) where the model's answer failed a check and the rules answered instead.`}
        </p>
        <p className="dk-lede" data-testid="score-uncertainty">
          {lenient.n} tickets is a small sample. With 95% confidence, this run gets all four fields right on between{" "}
          {runLow}% and {runHigh}% of tickets like these, and the rules on between {rulesLow}% and {rulesHigh}%.{" "}
          {overlap
            ? `The two ranges overlap, so ${lenient.n} tickets cannot say whether the model or the rules triage better.`
            : "The two ranges do not overlap."}
        </p>

        <h4 className="dk-h4">The rules&apos; score is in-sample</h4>
        <p className="dk-lede">
          The keyword rules were written while looking at these {TICKETS.length} tickets, and some of them copy a
          ticket&apos;s exact words, so they have seen the test. On the older closed tickets, which they were not
          written from, they pick the same runbook as the real resolution less often.
        </p>
        <div className="dk-scroll">
          <table className="dk-table">
            <caption className="sr-only">Keyword rules on older closed tickets</caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col" className="dk-num">
                  Keyword rules
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Same runbook as the real resolution, older closed tickets</th>
                <td className="dk-num">{share(HISTORY_CHECK.same, HISTORY_CHECK.n)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="dk-h4">Method</h4>
        <ol className="dk-list">
          <li>
            Reference answers for the {TICKETS.length} synthetic tickets are in{" "}
            <SourceLink path={REFERENCE_LABELS_PATH}>reference-labels.json</SourceLink>. Three AI reviewers labelled
            every ticket separately, from the ticket text and the label definitions only: two separate Claude runs and
            one Gemini run. None saw the earlier draft labels, the rules or any model&apos;s answers. They are not fully
            independent: the two Claude reviewers agreed with each other more often than with Gemini, and the model
            scored here is also Claude, so the labels may lean towards how Claude reads a ticket.
          </li>
          <li>
            The first answer in each field is the majority answer. A second answer is accepted only when at least one
            reviewer chose it and at least two accepted it. One field where all three disagreed was decided by hand,
            with the reason written in the file.
          </li>
          <li>
            Each triage answer is compared field by field: component, severity, action and runbook. Every field is
            scored on its own.
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
