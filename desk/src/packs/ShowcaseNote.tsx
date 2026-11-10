import { useId } from "react";
import { useIndustry } from "./IndustryContext";
import { DEFAULT_PACK_ID, industryName } from "./industry";

/** For an industry with no incident: the incident walkthrough is the default pack's showcase. */
export function ShowcaseNote() {
  const { pick } = useIndustry();
  const heading = useId();
  const name = industryName(DEFAULT_PACK_ID);
  return (
    <section className="dk-section showcase-note" aria-labelledby={heading}>
      <h3 id={heading} className="dk-h3">
        The incident walkthrough is the {name} showcase
      </h3>
      <p className="dk-lede">
        This industry has its queue, triage, patterns, knowledge base article and new-ticket check. The step-by-step
        incident story, with logs, an engineering handoff and a before and after check, exists for {name} only.
      </p>
      <button type="button" className="dk-button" onClick={() => pick(DEFAULT_PACK_ID)}>
        Switch to {name}
      </button>
    </section>
  );
}
