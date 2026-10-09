import { provenanceOfStep, useRun } from "../../run";
import { draftBy, originOfStep, pillTone } from "../ui/origin";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";
import { Classifier } from "./Classifier";
import "./KnowledgeBaseTab.css";

const bullets = (items: readonly string[]) => (
  <ul>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

/** The article support uses next time, and a box to check a new ticket against it. */
export function KnowledgeBaseTab() {
  const { run } = useRun();
  const article = run.steps.kb;
  const a = article.data;
  const origin = originOfStep(article);

  return (
    <div>
      <section aria-labelledby="kb-title">
        <p className="dk-kicker">Knowledge base</p>
        <p className="dk-tags">
          <Pill tone={pillTone(origin)}>{draftBy(origin)}</Pill>
          <Pill>Draft</Pill>
        </p>
        <article className="kb-article">
          <h3 id="kb-title" className="kb-title">
            {a.title}
          </h3>
          <h4>Applies when</h4>
          {bullets(a.applies_when)}
          <h4>How to confirm</h4>
          {bullets(a.how_to_confirm)}
          <h4>What to do</h4>
          <ol>
            {a.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="kb-aside">
            Step 1 is fixed text the desk always adds. The model does not write it, and the check reads wording only.
          </p>
          <h4>Escalate if</h4>
          {bullets(a.escalate_if)}
          <p className="kb-status">{a.status_note}</p>
          <p className="kb-related">
            {a.related.map((id) => (
              <span key={id} className="dk-mono kb-id">
                {id}
              </span>
            ))}
          </p>
        </article>
        <ProvenanceNote provenance={provenanceOfStep(article)} step="kb" />
      </section>

      <Classifier />
    </div>
  );
}
