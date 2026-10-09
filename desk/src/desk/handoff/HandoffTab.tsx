import { useState } from "react";
import { blockClass, draftBy, originOfStep, pillTone } from "../ui/origin";
import { ESCALATION_LINE, HERO } from "../../data/synthetic";
import { LAB } from "../../data/lab";
import { provenanceOfStep, useRun } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import { SourceLink } from "../ui/SourceLink";
import { packetMarkdown } from "./packetMarkdown";
import { ShiftNote } from "./ShiftNote";
import "./HandoffTab.css";

/** The packet as an engineer would receive it, then the end-of-shift note to India. */
export function HandoffTab() {
  const { run } = useRun();
  const packet = run.steps.handoff;
  const h = packet.data;
  const origin = originOfStep(packet);
  const fired = new Set(h.rules_triggered);
  const [copied, setCopied] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(packetMarkdown(h));
      setCopied("Copied as Markdown.");
    } catch {
      setCopied("The browser blocked copying.");
    }
  };

  return (
    <div>
      <section aria-labelledby="handoff-heading">
        <p className="dk-kicker">
          {HERO.incidentId} · Engineering handoff · draft, a person approves it before it is sent
        </p>
        <h3 id="handoff-heading" className="dk-h3">
          {h.title}
        </h3>
        <p className="dk-tags">
          <Pill tone={pillTone(origin)}>{draftBy(origin)}</Pill>
          <Pill>{h.severity}</Pill>
        </p>
        <p className="dk-lede">{h.scope}</p>

        <h4 className="dk-h4">The ask</h4>
        <p className={`handoff-question ${blockClass(origin)}`}>{h.the_ask}</p>

        <h4 className="dk-h4">Why it crosses the escalation line</h4>
        <ul className="dk-list dk-list--plain handoff-rules">
          {ESCALATION_LINE.escalateWhenAny.map((rule) => (
            <li key={rule.key} className={fired.has(rule.key) ? "handoff-rule handoff-rule--fired" : "handoff-rule"}>
              <span className="handoff-box" aria-hidden="true">
                {fired.has(rule.key) ? "✓" : ""}
              </span>
              {rule.text}
              <span className="sr-only">{fired.has(rule.key) ? " (fired)" : " (did not fire)"}</span>
            </li>
          ))}
        </ul>

        <h4 className="dk-h4">Reproduce</h4>
        <ol className="dk-list">
          {h.reproduction.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="dk-note">
          The reproduction test in the lab:{" "}
          <SourceLink path={LAB.reproduction.path}>{LAB.reproduction.className}</SourceLink>. It runs with the fix flag{" "}
          {LAB.reproduction.flag} and shows the session staying open.
        </p>

        <h4 className="dk-h4">Evidence attached</h4>
        <ul className="dk-list">
          {h.evidence_attached.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="dk-note">
          The attachments are in the Incident tab: the three gateway log excerpts, the fleet table and the
          unplug-to-drop timings. Linked tickets:{" "}
          {[...HERO.openIds, ...HERO.historyIds].map((id) => (
            <span key={id} className="dk-mono handoff-id">
              {id}
            </span>
          ))}
        </p>

        <h4 className="dk-h4">Unlikely causes</h4>
        <ul className="dk-list">
          {h.ruled_out.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h4 className="dk-h4">Workaround in place</h4>
        <p className="dk-lede">{h.workaround_in_place}</p>

        <p className="handoff-unconfirmed">
          <Pill tone="attn">Not confirmed</Pill> {h.hypothesis_note}
        </p>

        <p className="handoff-actions">
          <button type="button" className="dk-button" onClick={() => void copy()}>
            Copy as Markdown
          </button>
          <span role="status" aria-live="polite" className="dk-note">
            {copied}
          </span>
        </p>
        <ProvenanceNote provenance={provenanceOfStep(packet)} step="handoff" />
      </section>

      <ShiftNote />
    </div>
  );
}
