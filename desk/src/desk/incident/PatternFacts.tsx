import { ESCALATION_LINE, HERO } from "../../data/synthetic";
import { blockClass, originOfStep } from "../ui/origin";
import { WINDOW_DAYS, priorUses, provenanceOfStep, useRun } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import { RECORD_ONLY_RUNBOOK, incidentPattern, stuckByFirmware } from "./evidence";
import "./PatternFacts.css";

/** The pattern behind the incident: its facts, the escalation line and which triggers fired, and the AI's grouping. */
export function PatternFacts() {
  const { run, lanes, resultFor } = useRun();
  const pattern = incidentPattern(run.steps.patterns.data.patterns, lanes.held);
  const fired = new Set(ESCALATION_LINE.heroTriggers);
  const firmware = stuckByFirmware();
  const facts: [string, string, string][] = [
    [String(HERO.totalTickets), "tickets", `${HERO.openIds.length} open, ${HERO.historyIds.length} closed before`],
    [String(HERO.sites.length), "sites", "no single site or charger"],
    [String(-HERO.firstSeenDay), "days", "since first seen"],
    ...firmware.map(([fw, n]): [string, string, string] => [String(n), fw, `of ${HERO.totalTickets} stuck sessions`]),
    [
      String(priorUses(RECORD_ONLY_RUNBOOK).length),
      `${RECORD_ONLY_RUNBOOK} closures`,
      `as one-offs in ${WINDOW_DAYS} days`,
    ],
  ];

  return (
    <section className="dk-section" aria-labelledby="inc-pattern">
      <h3 id="inc-pattern" className="dk-h3">
        The pattern
      </h3>
      <ul className="inc-facts dk-list dk-list--plain">
        {facts.map(([value, label, detail]) => (
          <li key={label} className="fact">
            <span className="fact-value dk-mono">{value}</span>
            <span className="fact-label">{label}</span>
            <span className="fact-detail">{detail}</span>
          </li>
        ))}
      </ul>

      <h4 className="dk-h4">Escalation line (proposed)</h4>
      <p className="dk-note">
        Support owns it when {ESCALATION_LINE.supportOwns.map((s) => s.toLowerCase()).join("; ")}.
      </p>
      <ul className="dk-list dk-list--plain esc-rules" aria-label="Escalate to engineering when any of these is true">
        {ESCALATION_LINE.escalateWhenAny.map((rule) => (
          <li key={rule.key} className={fired.has(rule.key) ? "rule rule--fired" : "rule"}>
            <span className="rule-box" aria-hidden="true">
              {fired.has(rule.key) ? "✓" : ""}
            </span>
            <span>
              {rule.text}
              <span className="sr-only">{fired.has(rule.key) ? " (fired)" : " (did not fire)"}</span>
            </span>
          </li>
        ))}
      </ul>

      {pattern && (
        <>
          <h4 className="dk-h4">How the AI grouped the open tickets</h4>
          <div className={blockClass(originOfStep(run.steps.patterns))}>
            <p className="grouping-name">
              {pattern.name} {pattern.recurring && <Pill tone="attn">Recurring</Pill>}
            </p>
            <p className="dk-note">{pattern.why_grouped}</p>
            <p className="dk-note">
              {pattern.ticket_ids.length} open tickets:{" "}
              {pattern.ticket_ids.map((id) => (
                <span key={id} className="dk-mono grouping-id">
                  {id}
                  {resultFor(id)?.lane === "held" && <span className="sr-only"> (held)</span>}
                </span>
              ))}
              ; {pattern.history_ids.length} closed before.
            </p>
            <p className="dk-note">Next step it proposes: {pattern.next_step}</p>
          </div>
          <ProvenanceNote provenance={provenanceOfStep(run.steps.patterns)} step="patterns" />
        </>
      )}
    </section>
  );
}
