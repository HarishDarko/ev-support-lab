import { HERO } from "../../data/synthetic";
import { Pill } from "../ui/Pill";
import { RECORD_ONLY_RUNBOOK } from "./evidence";
import { FLAT_MINUTES, RECONNECT_SECONDS, detectorRun } from "./detector";
import "./Containment.css";

/** What support does while engineering works: correct the sessions, and run the read-only detector. */
export function Containment() {
  const { query, sessions } = detectorRun();
  const candidates = sessions.filter((s) => s.candidate).length;

  return (
    <section className="dk-section" aria-labelledby="inc-containment">
      <h3 id="inc-containment" className="dk-h3">
        Containment and the detector
      </h3>
      <ul className="dk-list">
        {HERO.supportNow.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h4 className="dk-h4">Detector run on a snapshot of open sessions (synthetic)</h4>
      <p className="dk-note">
        A read-only query: no code or production config change. Proposed to run every 15 minutes; here it runs once. A
        candidate has had no meter change for {FLAT_MINUTES} minutes or more and reconnected within {RECONNECT_SECONDS}{" "}
        seconds of the unplug.
      </p>
      <code className="detector-query dk-mono">{query}</code>
      <div className="dk-scroll">
        <table className="dk-table">
          <caption className="sr-only">Open sessions checked by the detector, with the result for each</caption>
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Charger</th>
              <th scope="col" className="dk-num">
                No meter change
              </th>
              <th scope="col" className="dk-num">
                Reconnect
              </th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(({ session, candidate, reason }) => (
              <tr key={session.id}>
                <th scope="row" className="dk-mono">
                  {session.id}
                </th>
                <td className="dk-mono">{session.charger}</td>
                <td className="dk-num">{session.flatMin} min</td>
                <td className="dk-num">{session.reconnectSec == null ? "–" : `${session.reconnectSec} s`}</td>
                <td>
                  {candidate ? <Pill tone="attn">Candidate</Pill> : <Pill>No hit</Pill>} {reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dk-note">
        {candidates} of {sessions.length} open sessions are candidates. The query does not check connector state or
        whether a newer transaction has started. A person does, before {RECORD_ONLY_RUNBOOK}.
      </p>
    </section>
  );
}
