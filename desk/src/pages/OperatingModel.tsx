import { ESCALATION_LINE } from "../data/synthetic";
import "./Page.css";

// A plain page, not part of the animated story: how the Eastern-hours dev-support role would run day to day.
// It is a proposal to adjust with the team, and it says so. No targets are invented; measures come first.

const DAY = [
  {
    time: "07:00–08:30",
    title: "Live handover with India engineering",
    text: "What is open, what changed overnight, what needs a decision. Anything they are mid-way through stays with its owner or is handed over by name.",
  },
  {
    time: "08:30",
    title: "NOC sync",
    text: "Alerts and repeat offenders from the night: which chargers, which sites, which ones have been reset before. During the day the NOC reaches this shift directly, with an agreed time to acknowledge.",
  },
  {
    time: "Through the day",
    title: "Triage and investigate",
    text: "Runbook closures go to a person for approval. A symptom that keeps coming back is held and treated as a pattern. Anything past the escalation line becomes one incident with one owner and one packet for engineering. Customer updates on an incident have a named owner too.",
  },
  {
    time: "15:30",
    title: "End-of-shift note to India",
    text: "Done, needs you (ticket ids, an owner and a deadline for each), escalated, watch.",
  },
];

const BOUNDARIES = [
  "What this role may change on its own: runbook actions a person has approved. Anything that changes production configuration, billing or code goes through the owning team.",
  "Evenings (15:30–23:30 ET): automation keeps triaging and the escalation line still applies; who is paged for an urgent billing or regional issue is agreed with engineering, not assumed.",
];

const MEASURES = [
  "Time from escalation to first engineering response.",
  "Share of tickets closed by a runbook, and share that needed engineering.",
  "Repeat symptoms per runbook after mitigation: a sign that a cause is still open.",
  "Tickets reopened after closure.",
  "Handoffs sent back for missing information, in either direction.",
];

const PLAN = [
  {
    when: "First 30 days",
    items: [
      "Learn the platform, the runbooks and the ticketing tools the NOC and support teams use.",
      "Join the India handovers and take the Eastern-hours queue with review.",
      "Agree the escalation line and the handover note format with engineering and the NOC.",
      "Start measuring, with no targets yet.",
      "Write down the ten most common recurring symptoms and where each one ends up.",
    ],
  },
  {
    when: "By 60 days",
    items: [
      "Own the Eastern-hours queue.",
      "Review with their owners the runbooks that keep closing the same symptom.",
    ],
  },
  {
    when: "By 90 days",
    items: [
      "Take one recurring pattern from tickets to an engineering fix, and verify it (against a control where that is possible).",
      "Put numbers on the measures above, then agree targets with the team.",
    ],
  },
];

export function OperatingModel() {
  return (
    <article className="page">
      <p className="page-kicker">How I'd run it · a proposal to adjust with the team</p>
      <h1 className="page-title">Eastern-hours dev support, day to day</h1>
      <p className="page-lede">
        The NOC covers the network around the clock and India engineering covers 23:30–08:30 ET. This shift covers
        07:00–15:30 ET, so every day starts with ninety minutes of live overlap. The aim is that the India team's time
        goes to engineering: the Eastern-hours queue is handled here, and anything that needs them arrives as one
        complete packet.
      </p>

      <section className="page-section" aria-labelledby="op-day">
        <h2 id="op-day">The day</h2>
        <ol className="timeline">
          {DAY.map((d) => (
            <li key={d.title}>
              <span className="timeline-time">{d.time}</span>
              <div>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="page-section" aria-labelledby="op-line">
        <h2 id="op-line">When it goes to engineering</h2>
        <p className="page-note">Proposed, not an existing policy.</p>
        <div className="two-col">
          <div>
            <h3>Support owns it when</h3>
            <ul>
              {ESCALATION_LINE.supportOwns.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>It goes to engineering when any of these hold</h3>
            <ul>
              {ESCALATION_LINE.escalateWhenAny.map((r) => (
                <li key={r.key}>{r.text}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-section" aria-labelledby="op-bounds">
        <h2 id="op-bounds">Boundaries</h2>
        <ul>
          {BOUNDARIES.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <section className="page-section" aria-labelledby="op-measure">
        <h2 id="op-measure">What I'd measure</h2>
        <p className="page-note">Measure first for a few weeks, then agree targets with the team.</p>
        <ul>
          {MEASURES.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </section>

      <section className="page-section" aria-labelledby="op-plan">
        <h2 id="op-plan">The first 90 days</h2>
        <div className="three-col">
          {PLAN.map((p) => (
            <div key={p.when}>
              <h3>{p.when}</h3>
              <ul>
                {p.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
