import { LAB, REPO, source } from "../data/lab";
import "./Page.css";

// How the prototype was built, how its AI output is checked, and what it does not prove. Plain text on purpose:
// this is the page an engineer reads before asking questions.

const BUILT = [
  {
    part: "The desk",
    stack: "React and TypeScript, Cloudflare Pages Functions, Vitest and Playwright with accessibility checks.",
    path: "desk",
  },
  {
    part: "The reproduction lab",
    stack: "Java 25, Spring Boot 4, PostgreSQL through Testcontainers, a scripted charger over a real websocket.",
    path: "lab",
  },
];

const AI_CHECKS = [
  "Every triage decision quotes the ticket. A quote that is not in the ticket (ignoring case, spacing and punctuation) is rejected, and the rules answer instead.",
  "A closure must name a real runbook and fit the ticket, and a person approves it. A record-only runbook also needs a person to confirm the meter first.",
  "A record-only runbook that keeps closing the same symptom is held, and the tickets become a pattern.",
  "Every AI answer shows its model, the checks that ran, and its cost. A rules answer is labelled as rules.",
];

// What two rounds of independent review found in the lab, and what changed. Each row has a test.
const FIXED = [
  {
    found: "Transactions were keyed on transactionId alone, but OCPP ids are only unique per charging station.",
    now: "Transactions and event idempotency are keyed on the station as well.",
  },
  {
    found: "Events were replayed by timestamp, so a charger clock correction could reorder them.",
    now: "Events replay in seqNo order, counted from the transaction's own Started. A gap, or a missing Started, stops automatic reconciliation.",
  },
  {
    found: "A charger that did not report ongoingIndicator was treated as not ongoing.",
    now: "Only an explicit not-ongoing answer, with nothing queued, allows a provisional close. Silence goes to a person; a charger that says ongoing is left alone.",
  },
  {
    found: "Two equal meter samples were taken as proof the session had stopped.",
    now: "The samples must be a minimum time apart, recent, and not dated more than two minutes ahead of the backend clock. Otherwise a person decides.",
  },
  {
    found:
      "An invoice could be confirmed from incomplete data: an Ended without a meter value, or a sequence with a gap.",
    now: "It stays provisional for review until the data is complete. The lab records one charge per transaction; it has no real payment system.",
  },
  {
    found: "A newer transaction could start on the same charging point between the check and the close.",
    now: "Both paths take a per-charging-point lock in a fixed order, so the check sees it.",
  },
  {
    found: "The reconciliation sweep ignored the per-station switch for the fix.",
    now: "It skips any station where the fix is turned off.",
  },
];

// OCPP 1.6 has the same reconnect race with fewer tools. Kept to facts of the 1.6 specification.
const OCPP16 = [
  "The backend assigns the transactionId, in StartTransaction.conf.",
  "The protocol defines chronological delivery of transaction-related messages, but provides no transaction-event sequence number. Backend deduplication needs message-specific rules; the transactionId and timestamps alone are not enough.",
  "There is no standard query for whether a StopTransaction is still queued. The charger must queue transaction-related messages while offline; failed submissions are retried under TransactionMessageAttempts and TransactionMessageRetryInterval, and after the configured failure limit the message should be discarded.",
  "If the charger supports the RemoteTrigger profile, TriggerMessage can ask for a StatusNotification or MeterValues, but not for a StopTransaction.",
];

const NOT_MODELLED = [
  "OCPP 1.6J itself (see above): the lab speaks 2.0.1 only.",
  "TxStopPoint configuration, which decides when a charger ends a transaction.",
  "Roaming (OCPI) and charge detail records.",
  "Idle fees, real payment capture and refunds.",
  "Production traffic volumes, or anything about a real company's systems. Every station, ticket and number is synthetic.",
];

export function EngineeringNotes() {
  return (
    <article className="page">
      <p className="page-kicker">Engineering notes</p>
      <h1 className="page-title">How this was built, and what it does not prove</h1>
      <p className="page-lede">
        Built with AI coding assistants. I decided what to build and the rules it had to follow, reviewed the code, and
        checked it with tests and independent reviews by separate AI models. The assistants wrote much of the code.
      </p>

      <section className="page-section" aria-labelledby="en-built">
        <h2 id="en-built">The two parts</h2>
        <ul className="plain">
          {BUILT.map((b) => (
            <li key={b.part}>
              <h3>{b.part}</h3>
              <p>
                {b.stack}{" "}
                <a href={`${REPO}/tree/main/${b.path}`} target="_blank" rel="noreferrer">
                  Source
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-section" aria-labelledby="en-ai">
        <h2 id="en-ai">How the AI output is checked</h2>
        <ul>
          {AI_CHECKS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="page-links">
          <a href={source("desk/functions/_lib/validate.ts")} target="_blank" rel="noreferrer">
            The validators
          </a>
          <a href={source("desk/tests/attacks.test.ts")} target="_blank" rel="noreferrer">
            The cases they are tested against
          </a>
        </p>
      </section>

      <section className="page-section" aria-labelledby="en-fixed">
        <h2 id="en-fixed">What two rounds of AI review found, and what changed</h2>
        <table className="page-table">
          <thead>
            <tr>
              <th scope="col">Found</th>
              <th scope="col">Now</th>
            </tr>
          </thead>
          <tbody>
            {FIXED.map((f) => (
              <tr key={f.found}>
                <td>{f.found}</td>
                <td>{f.now}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="page-note">Each fix has a test that would have caught the original problem.</p>
      </section>

      <section className="page-section" aria-labelledby="en-16">
        <h2 id="en-16">The same problem on OCPP 1.6</h2>
        <p>The lab models 2.0.1. On 1.6 an analogous race exists, with fewer tools to resolve it:</p>
        <ul>
          {OCPP16.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>
          OCPP 1.6 has no standard transaction-status query that returns an explicit not-ongoing answer. A 1.6 version
          of this fallback would combine waiting, connector status, meter evidence and a person; flat energy alone
          cannot establish that a transaction ended.
        </p>
      </section>

      <section className="page-section" aria-labelledby="en-limits">
        <h2 id="en-limits">What the lab does not model</h2>
        <ul>
          {NOT_MODELLED.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="page-links">
          <a href={source(LAB.readme)} target="_blank" rel="noreferrer">
            Lab README
          </a>
          {LAB.adrs.map((a) => (
            <a key={a.path} href={source(a.path)} target="_blank" rel="noreferrer">
              {a.title}
            </a>
          ))}
          <a href={LAB.precedent.url} target="_blank" rel="noreferrer">
            Related public fix: {LAB.precedent.title}
          </a>
        </p>
      </section>
    </article>
  );
}
