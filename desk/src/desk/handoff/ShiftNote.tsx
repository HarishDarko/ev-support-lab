import { provenanceOfStep, useRun } from "../../run";
import { draftBy, originOfStep, pillTone } from "../ui/origin";
import { Pill } from "../ui/Pill";
import { ProvenanceNote } from "../ui/ProvenanceNote";

const bullets = (items: readonly string[]) =>
  items.length ? (
    <ul className="dk-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="dk-note">Nothing.</p>
  );

/** The end-of-shift note from the Eastern-time shift to the India team, written from this run's summary. */
export function ShiftNote() {
  const { run } = useRun();
  const note = run.steps.shiftnote;
  const n = note.data;
  const origin = originOfStep(note);
  return (
    <section className="dk-section" aria-labelledby="shiftnote-heading">
      <h3 id="shiftnote-heading" className="dk-h3">
        End-of-shift note to the India team
      </h3>
      <p className="dk-tags">
        <Pill tone={pillTone(origin)}>{draftBy(origin)}</Pill>
      </p>
      <p className="dk-lede">{n.headline}</p>
      <h4 className="dk-h4">Done</h4>
      {bullets(n.done)}
      <h4 className="dk-h4">Needs you</h4>
      {bullets(n.needs_you)}
      <h4 className="dk-h4">With engineering</h4>
      {bullets(n.escalated)}
      <h4 className="dk-h4">Watch overnight</h4>
      {bullets(n.watch)}
      <ProvenanceNote provenance={provenanceOfStep(note)} step="shiftnote" />
    </section>
  );
}
