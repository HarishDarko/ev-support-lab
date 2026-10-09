import { useId, useState } from "react";
import { blockClass, pillTone } from "../ui/origin";
import { NEW_TICKET_EXAMPLE } from "../../data/synthetic";
import { MAX_TICKET_CHARS, originOf, provenanceOfStep, useRun, type ClassifyModel, type StepResult } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import "./Classifier.css";

interface Checked {
  text: string;
  answer: StepResult<ClassifyModel>;
  /** True for the recorded answer to the example; false once the visitor has run the check. */
  recorded: boolean;
}

/** A new ticket, checked against the article. The one place a visitor types their own text. */
export function Classifier() {
  const { run, classify, label } = useRun();
  const field = useId();
  const [text, setText] = useState(NEW_TICKET_EXAMPLE);
  const [checked, setChecked] = useState<Checked>({
    text: NEW_TICKET_EXAMPLE,
    answer: run.steps.classify,
    recorded: true,
  });
  const [busy, setBusy] = useState(false);

  const check = async () => {
    const submitted = text.trim();
    setBusy(true);
    try {
      setChecked({ text: submitted, answer: await classify(submitted), recorded: false });
    } finally {
      setBusy(false);
    }
  };

  const current = checked.text === text.trim();
  const { data, trace } = checked.answer;
  const origin = originOf(trace);
  const fellBack = origin === "rules";

  return (
    <section className="dk-section" aria-labelledby="classify-heading">
      <h3 id="classify-heading" className="dk-h3">
        A new ticket arrives
      </h3>
      <p className="dk-lede">
        Edit the ticket or use it as it is. It is checked against the article, live. Everything here is synthetic.
      </p>
      <label htmlFor={field} className="classify-label">
        New ticket text
      </label>
      <textarea
        id={field}
        className="classify-text"
        value={text}
        maxLength={MAX_TICKET_CHARS}
        rows={4}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="classify-actions">
        <button type="button" className="dk-button" onClick={() => void check()} disabled={busy || !text.trim()}>
          {busy ? "Checking" : "Check against the article"}
        </button>
        <span className="dk-note classify-count dk-mono">
          {text.length} / {MAX_TICKET_CHARS}
        </span>
      </p>

      <div role="status" aria-live="polite">
        {busy && <p className="dk-note">Checking the ticket against the article.</p>}
        {!busy && !current && <p className="dk-note">The text has changed. Check it again to see how it matches.</p>}
        {!busy && current && (
          <div className="classify-result" data-testid="classify-result">
            <p className="dk-kicker">
              {checked.recorded ? `Recorded result for this example · ${label}` : "Checked just now"}
            </p>
            <p className="classify-pills">
              <Pill tone={pillTone(origin)}>{fellBack ? "Rules fallback" : "AI, checked"}</Pill>
              <Pill>{data.component}</Pill>
              <Pill>{data.severity}</Pill>
              <Pill tone={data.matches_known_pattern ? "ok" : "attn"}>
                {data.matches_known_pattern ? "Matches the article" : "Outside the known pattern"}
              </Pill>
              <Pill tone={data.escalate ? "bad" : "neutral"}>
                {data.escalate ? "Escalate to engineering" : "No engineering page"}
              </Pill>
            </p>
            <div className={blockClass(origin)}>
              <p className="classify-action">{data.suggested_action}</p>
              <p className="dk-note">{data.why}</p>
            </div>
            {data.confirm && <p className="classify-confirm">{data.confirm}</p>}
            {fellBack && trace.fallbackReason && (
              <p className="dk-note">The live call was not used: {trace.fallbackReason}</p>
            )}
            <ProvenanceNote provenance={provenanceOfStep(checked.answer)} step="classify" />
          </div>
        )}
      </div>
    </section>
  );
}
