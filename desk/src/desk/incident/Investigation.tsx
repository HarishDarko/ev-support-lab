import { HERO } from "../../data/synthetic";
import { blockClass, originOfStep, pillTone } from "../ui/origin";
import { provenanceOfStep, useRun } from "../../run";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import "./Investigation.css";

const list = (items: readonly string[]) => (
  <ul className="dk-list">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

/** The AI's reading of the evidence: what is happening, the evidence it quotes, two hypotheses, what is unknown. */
export function Investigation() {
  const { run } = useRun();
  const { data } = run.steps.investigate;
  const origin = originOfStep(run.steps.investigate);

  return (
    <section className="dk-section" aria-labelledby="inc-investigation">
      <h3 id="inc-investigation" className="dk-h3">
        Investigation
      </h3>
      <div className={blockClass(origin)}>
        <p className="inv-symptom">{data.symptom}</p>
        <h4 className="dk-h4">Who it hits</h4>
        {list(data.impact)}
      </div>

      <h4 className="dk-h4">Evidence</h4>
      <ol className="dk-list inv-evidence">
        {data.evidence.map((e) => (
          <li key={e.point}>
            <p className="inv-point">{e.point}</p>
            <p className="dk-note inv-source">
              <span className="inv-source-name">{e.source}</span>
              {e.quote && (
                <>
                  <span className="dk-check dk-check--ok" aria-hidden="true">
                    ✓
                  </span>
                  <span className="sr-only">Quote found word for word in the source: </span>
                  <q className="dk-mono inv-quote">{e.quote}</q>
                </>
              )}
            </p>
          </li>
        ))}
      </ol>

      <h4 className="dk-h4">Hypotheses, ranked by how direct the evidence is</h4>
      <div className="hyps">
        {data.hypotheses.map((h) => (
          <article key={h.statement} className="hyp">
            <p className="hyp-tags">
              <Pill tone={pillTone(origin)}>{h.status}</Pill>
              <Pill tone="attn">Not confirmed</Pill>
            </p>
            <p className="hyp-statement">{h.statement}</p>
            <h5 className="hyp-h">Supports it</h5>
            {list(h.supports)}
            <h5 className="hyp-h">Against it, or still missing</h5>
            {list(h.against_or_gaps)}
          </article>
        ))}
      </div>
      <p className="dk-note">They may coexist. Neither is proven.</p>

      <div className="inv-cols">
        <div>
          <h4 className="dk-h4">Judged unlikely by support</h4>
          <ul className="dk-list">
            {HERO.ruledOut.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="dk-h4">Only engineering can answer</h4>
          {list(data.open_questions)}
        </div>
      </div>
      <ProvenanceNote provenance={provenanceOfStep(run.steps.investigate)} step="investigate" />
    </section>
  );
}
