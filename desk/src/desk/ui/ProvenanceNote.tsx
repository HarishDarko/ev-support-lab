import { CHECK_SCOPE, costText, formatSeconds, formatTokens, type Provenance, type StepKey } from "../../run";
import { pillTone } from "./origin";
import { Pill } from "./Pill";
import "./ProvenanceNote.css";

interface Props {
  provenance: Provenance;
  step: StepKey;
  /** What the summary line is for, e.g. "How this was produced". */
  title?: string;
}

/**
 * Where an AI item came from, always visible as one line, with the full trace one click away:
 * model, attempts, latency, tokens, cost and every check that ran.
 */
export function ProvenanceNote({ provenance: p, step, title = "How this was produced" }: Props) {
  const scope = CHECK_SCOPE[step];
  return (
    <details className="dk-prov">
      <summary className="prov-summary">
        <Pill tone={pillTone(p.origin)}>{p.label}</Pill>
        <span className="prov-model">{p.model}</span>
        <span className="prov-when">{p.live ? "live" : "recorded"}</span>
        <span className="prov-cost">{costText(p)}</span>
        <span className="prov-title">{title}</span>
      </summary>
      <div className="prov-body">
        {p.fallbackReason && (
          <p className="prov-reason">
            The live result was not used: {p.fallbackReason} These answers come from deterministic rules built from the
            data.
          </p>
        )}
        <dl className="dk-dl">
          <dt>Produced by</dt>
          <dd>
            {p.origin === "ai" ? "A model" : "Deterministic rules"},{" "}
            {p.live ? "in a live call during this visit" : "in the recorded run"}
          </dd>
          <dt>Model</dt>
          <dd className="dk-mono">{p.model}</dd>
          <dt>Attempts</dt>
          <dd className="dk-mono">{p.attempts}</dd>
          <dt>Latency</dt>
          <dd className="dk-mono">{p.ms ? formatSeconds(p.ms) : "not recorded"}</dd>
          <dt>Tokens</dt>
          <dd className="dk-mono">{formatTokens(p.tokens)}</dd>
          <dt>Estimated cost</dt>
          <dd className="dk-mono">{costText(p)}</dd>
          <dt>Reliability</dt>
          <dd>{p.reliability ? `${p.reliability}. ${p.reliabilityNote}` : "not recorded"}</dd>
        </dl>
        {p.checks.length > 0 && (
          <ul className="dk-list dk-list--plain prov-checks" aria-label="Checks that ran">
            {p.checks.map((c) => (
              <li key={c.name}>
                <span className={`dk-check ${c.passed ? "dk-check--ok" : "dk-check--bad"}`} aria-hidden="true">
                  {c.passed ? "✓" : "!"}
                </span>
                <span className="sr-only">{c.passed ? "Passed: " : "Flagged: "}</span>
                {c.name}
                {c.detail && <span className="prov-detail"> · {c.detail}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="dk-note">
          Checked: {scope.checked}. Not checked: {scope.notChecked}. Passing the checks does not prove the reasoning is
          right.
        </p>
      </div>
    </details>
  );
}
