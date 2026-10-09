import { SITES } from "../../data/synthetic";
import { blockClass, pillTone } from "../ui/origin";
import type { TicketResult } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import { QuotedText } from "../ui/QuotedText";
import { useMeterGate } from "../../story/meterGate";
import "./Inspector.css";

const ACTION_LABEL: Record<string, string> = {
  close_with_runbook: "Close with runbook",
  needs_human: "Needs a person",
  escalation_candidate: "Escalation candidate",
  info_only: "Info only",
};

/** The selected ticket in full: its text with the quoted words highlighted, the decision, and how it was checked. */
export function Inspector({ entry }: { entry: TicketResult | undefined }) {
  const gate = useMeterGate();
  if (!entry) {
    return (
      <aside className="inspector" id="queue-inspector" aria-label="Selected ticket">
        <p className="dk-note">Select a ticket to see its text, the quoted words and how the decision was checked.</p>
      </aside>
    );
  }
  const { ticket, result, runbook, repeatRule, provenance } = entry;
  const site = ticket.site === "-" ? null : `${ticket.site} · ${SITES[ticket.site] ?? ""}`;

  return (
    <aside className="inspector" id="queue-inspector" aria-label={`Ticket ${ticket.id}`}>
      <p className="dk-kicker">
        {ticket.id} · opened {ticket.opened} ET
      </p>
      <p className="inspector-text" data-testid="inspector-text">
        <QuotedText text={ticket.text} quote={entry.quote ?? entry.matched} tone={entry.quote ? "ai" : "rule"} />
      </p>
      <dl className="dk-dl inspector-facts">
        <dt>Raised by</dt>
        <dd>{ticket.from}</dd>
        {site && (
          <>
            <dt>Site</dt>
            <dd>{site}</dd>
          </>
        )}
        {ticket.charger !== "-" && (
          <>
            <dt>Charger</dt>
            <dd className="dk-mono">{ticket.charger}</dd>
            <dt>Firmware</dt>
            <dd className="dk-mono">{ticket.fw}</dd>
          </>
        )}
      </dl>

      <section className={`${blockClass(provenance.origin)} inspector-ai`} aria-labelledby="inspector-decision">
        <h4 id="inspector-decision" className="dk-h4 inspector-decision">
          Triage proposal <Pill tone={pillTone(provenance.origin)}>{provenance.label}</Pill>
        </h4>
        <p className="inspector-summary">{result.summary}</p>
        <p className="dk-note inspector-reason">{result.reason}</p>
        {entry.quote ? (
          <p className="dk-note">
            <span className="dk-check dk-check--ok" aria-hidden="true">
              ✓
            </span>
            Quote found in the ticket, highlighted above.
          </p>
        ) : entry.matched ? (
          <p className="dk-note">The words the rule matched are highlighted above.</p>
        ) : (
          <p className="dk-note">No verified quote, so nothing is highlighted.</p>
        )}
        {result.support === "weak" && (
          <p className="dk-note">The quote does not name the label's subject. It was kept and marked weak.</p>
        )}
        {result.source === "rules" && (
          <p className="dk-note">
            {result.fallback_reason ?? "The live call was not used."}
            {result.rejected_quote ? ` The model quoted "${result.rejected_quote}".` : ""} The deterministic rules
            decided instead.
          </p>
        )}
      </section>

      <dl className="dk-dl inspector-facts">
        <dt>Lane</dt>
        <dd>{entry.lane === "held" ? <Pill tone="attn">Held by the repeat rule</Pill> : entry.laneLabel}</dd>
        <dt>Proposed</dt>
        <dd>{ACTION_LABEL[result.action] ?? result.action}</dd>
        {runbook && (
          <>
            <dt>Runbook</dt>
            <dd>
              <span className="dk-mono">{runbook.id}</span> {runbook.title}
            </dd>
          </>
        )}
        <dt>Component</dt>
        <dd className="dk-mono">{result.component}</dd>
        <dt>Severity</dt>
        <dd className="dk-mono">{result.severity}</dd>
        <dt>Confidence</dt>
        <dd className="dk-mono">{Math.round(result.confidence * 100)}%</dd>
      </dl>

      {result.precondition && (
        <p className="inspector-flag">
          <strong>Closure sent to a person.</strong> {result.precondition}
        </p>
      )}

      {repeatRule && (
        <section className="inspector-flag" aria-labelledby="inspector-held">
          <h4 id="inspector-held" className="dk-h4">
            Held: {repeatRule.runbook.id} has closed this {repeatRule.uses.length} times in {repeatRule.windowDays} days
          </h4>
          <p>
            {repeatRule.runbook.id} only corrects the record; it does not change why the session stayed open. For "
            {repeatRule.runbook.scope}" it has already closed {repeatRule.uses.length} tickets at {repeatRule.sites}{" "}
            sites, each as a one-off. The rule: a record-only runbook is not applied again after {repeatRule.limit}{" "}
            closures in {repeatRule.windowDays} days. The ticket stays open and joins the incident.
          </p>
          <details>
            <summary>The {repeatRule.uses.length} earlier closures</summary>
            <ul className="dk-list dk-list--plain inspector-history">
              {repeatRule.uses.map((h) => (
                <li key={h.id}>
                  <span className="dk-mono">{h.id}</span> · day {h.day} · <span className="dk-mono">{h.site}</span> ·{" "}
                  {h.resolution}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {entry.needsMeterCheck && entry.lane !== "person" && (
        <div className="dk-note">
          <p>
            {runbook?.id} closes at the last recorded meter value, so a person checks that the meter shows no energy
            change since unplug before it runs.
          </p>
          {entry.lane === "close" && gate && (
            <label className="inspector-meter">
              <input
                type="checkbox"
                checked={gate.checked.has(entry.ticket.id)}
                onChange={(e) => gate.confirm(entry.ticket.id, e.currentTarget.checked)}
              />
              I checked the meter: no energy change since unplug
            </label>
          )}
          {entry.lane === "close" && gate && !gate.checked.has(entry.ticket.id) && (
            <p className="dk-mono">Not approvable until the meter is checked.</p>
          )}
        </div>
      )}

      <ProvenanceNote provenance={provenance} step="triage" />
    </aside>
  );
}
