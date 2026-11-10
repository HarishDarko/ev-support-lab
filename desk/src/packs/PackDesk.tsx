// The desk for an industry with no incident walkthrough, loaded only when that industry is picked. Everything on it
// comes from the industry's keyword rules: no AI run has been recorded for it yet, and the page says so.
import { useEffect, useState } from "react";
import type { PackId } from "../../shared/packs";
import { SCORE_FIELDS, type ReferenceLabel } from "../run/score";
import { ShowcaseNote } from "./ShowcaseNote";
import { packView, type AnyPack, type PackView } from "./packView";
import "./PackDesk.css";

type Loaded = { pack: AnyPack; labels: ReferenceLabel[]; reviewed: string };

const LOADERS: Partial<Record<PackId, () => Promise<Loaded>>> = {
  "saas-support": () =>
    Promise.all([
      import("../../shared/packs/saas-support"),
      import("../../../docs/eval/reference-labels.saas-support.json"),
    ]).then(([m, l]) => ({
      pack: m.SAAS_SUPPORT as unknown as AnyPack,
      labels: l.default.labels,
      reviewed: l.default.reviewed,
    })),
  "e-commerce": () =>
    Promise.all([
      import("../../shared/packs/e-commerce"),
      import("../../../docs/eval/reference-labels.e-commerce.json"),
    ]).then(([m, l]) => ({
      pack: m.E_COMMERCE as unknown as AnyPack,
      labels: l.default.labels,
      reviewed: l.default.reviewed,
    })),
};

const FIELD: Record<(typeof SCORE_FIELDS)[number], string> = {
  component: "Component",
  severity: "Severity",
  action: "Action",
  runbook: "Runbook",
};
const share = (k: number, n: number) => (n ? `${k} of ${n} (${Math.round((100 * k) / n)}%)` : "–");
const dash = (v: unknown) => (typeof v === "string" && v !== "-" && v !== "" ? v : "–");

export function PackDesk({ id }: { id: PackId }) {
  const [state, setState] = useState<{ id: PackId; loaded: Loaded | null; failed: boolean }>({
    id,
    loaded: null,
    failed: false,
  });
  useEffect(() => {
    let live = true;
    const load = LOADERS[id];
    if (!load) return;
    load().then(
      (loaded) => live && setState({ id, loaded, failed: false }),
      () => live && setState({ id, loaded: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const loaded = state.id === id ? state.loaded : null;
  if (state.id === id && state.failed)
    return (
      <article className="page">
        <p className="page-lede" role="alert">
          This industry did not load. Reload the page to try again.
        </p>
      </article>
    );
  if (!loaded)
    return (
      <article className="page" aria-busy="true">
        <p className="page-lede" role="status">
          Loading this industry&apos;s queue. It takes a moment.
        </p>
      </article>
    );
  return <Desk loaded={loaded} view={packView(loaded.pack, loaded.labels)} />;
}

function Desk({ loaded, view }: { loaded: Loaded; view: PackView }) {
  const { pack, reviewed } = loaded;
  const fields = pack.fields ?? [];
  const { lenient, strict, history } = view.score;
  return (
    <article className="page pack-desk">
      <p className="page-kicker">{pack.name} · synthetic data · prototype</p>
      <h1 className="page-title">{pack.tickets.length} tickets are waiting.</h1>
      <p className="page-lede">
        These answers come from the desk&apos;s keyword rules. No AI run has been recorded for this industry yet, so
        there is no model to compare with here.
      </p>

      <section className="page-section" aria-labelledby="pack-queue">
        <h2 id="pack-queue">Queue</h2>
        <div className="dk-scroll">
          <table className="dk-table">
            <caption className="sr-only">Open tickets with the rules&apos; triage for each</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Source</th>
                {fields.map((f) => (
                  <th key={f.key} scope="col">
                    {f.label}
                  </th>
                ))}
                <th scope="col">Lane</th>
                <th scope="col">Component</th>
                <th scope="col">Sev</th>
                <th scope="col">Runbook</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map(({ ticket, result, lane }) => (
                <tr key={ticket.id}>
                  <th scope="row" className="dk-mono">
                    {ticket.id}
                  </th>
                  <td>{dash(ticket["from"])}</td>
                  {fields.map((f) => (
                    <td key={f.key}>{dash(ticket[f.key])}</td>
                  ))}
                  <td>{lane}</td>
                  <td className="dk-mono">{result.component}</td>
                  <td className="dk-mono">{result.severity}</td>
                  <td className="dk-mono">{result.runbook === "none" ? "–" : result.runbook}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-section" aria-labelledby="pack-patterns">
        <h2 id="pack-patterns">Patterns</h2>
        {view.patterns.length ? (
          <ul className="dk-list">
            {view.patterns.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong>: {p.ticket_ids.join(", ")}
                {p.recurring ? `; seen before in ${p.history_ids.join(", ")}` : ""}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="page-note">No two tickets match the same rule.</p>
        )}
      </section>

      {view.article && (
        <section className="page-section" aria-labelledby="pack-article">
          <h2 id="pack-article">Knowledge base article: {view.article.title}</h2>
          <ol className="dk-list">
            {view.article.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="page-note">Send to engineering if: {view.article.escalate_if.join(" ")}</p>
          {view.check && pack.newTicketExample && (
            <p className="page-note">
              New ticket: &ldquo;{pack.newTicketExample}&rdquo;{" "}
              {view.check.matches_known_pattern ? "Matches this article." : "Does not match this article."}{" "}
              {view.check.suggested_action} {view.check.confirm}
            </p>
          )}
        </section>
      )}

      <section className="page-section" aria-labelledby="pack-score">
        <h2 id="pack-score">Scorecard</h2>
        <p className="page-note">
          The rules scored against reference labels for the {pack.tickets.length} tickets, reviewed on {reviewed} by
          three independent AI reviewers (two separate Claude runs and one Gemini run, majority answer first).
        </p>
        <div className="dk-scroll">
          <table className="dk-table">
            <caption className="sr-only">Keyword rules against the reviewed labels</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col" className="dk-num">
                  Keyword rules
                </th>
              </tr>
            </thead>
            <tbody>
              {SCORE_FIELDS.map((f) => (
                <tr key={f}>
                  <th scope="row">{FIELD[f]}</th>
                  <td className="dk-num">{share(lenient.fields[f], lenient.n)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">All four right</th>
                <td className="dk-num">{share(lenient.allFour, lenient.n)}</td>
              </tr>
              <tr>
                <th scope="row">Same runbook as the real resolution, older closed tickets</th>
                <td className="dk-num">{share(history.same, history.n)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="page-note">
          Counting only the majority answer, the rules are fully right on {share(strict.allFour, strict.n)} tickets. The
          rules were written while looking at these tickets, so their score here is in-sample: it says the rules fit the
          examples, not that they would do as well on new tickets. The closed tickets were written in the same build, so
          they are only a rough second check.
        </p>
      </section>

      <ShowcaseNote />
    </article>
  );
}
