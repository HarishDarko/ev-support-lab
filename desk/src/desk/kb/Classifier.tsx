import { useId, useState } from "react";
import { NO_CAPTURE } from "../../analytics";
import { blockClass, pillTone } from "../ui/origin";
import { asSentence } from "../ui/sentence";
import { MAX_TICKET_CHARS, originOf, provenanceOfStep, useRun, type ClassifyModel, type StepResult } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import "./Classifier.css";

/** A check the visitor ran: the text they sent and the answer. */
interface Checked {
  text: string;
  answer: StepResult<ClassifyModel>;
}

/** A new ticket, checked against the article. The one place a visitor types their own text. */
export function Classifier() {
  const { pack, run, classify, label } = useRun();
  const field = useId();
  const [text, setText] = useState(pack.newTicketExample);
  // Only the visitor's own check is kept here. Until there is one, the example's answer is read from the run on
  // every render, so a live run that arrives replaces the recorded answer instead of leaving a stale copy.
  const [manual, setManual] = useState<Checked | null>(null);
  const checked: Checked = manual ?? { text: pack.newTicketExample, answer: run.steps.classify };
  const [busy, setBusy] = useState(false);

  const check = async () => {
    const submitted = text.trim();
    setBusy(true);
    try {
      setManual({ text: submitted, answer: await classify(submitted) });
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
        Edit the ticket or use it as it is.{" "}
        {pack.liveRuns
          ? "It is checked against the article, live."
          : "Live runs are off for this industry, so the rules check it against the article."}{" "}
        Everything here is synthetic.
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
          <div className={`classify-result ${NO_CAPTURE}`} data-testid="classify-result">
            <p className="dk-kicker">
              {manual
                ? "Checked just now"
                : checked.answer.live
                  ? "Result for this example from the live run"
                  : `Recorded result for this example · ${label}`}
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
            {fellBack && asSentence(trace.fallbackReason) && (
              <p className="dk-note">The live call was not used: {asSentence(trace.fallbackReason)}</p>
            )}
            <ProvenanceNote provenance={provenanceOfStep(checked.answer)} step="classify" />
          </div>
        )}
      </div>
    </section>
  );
}
