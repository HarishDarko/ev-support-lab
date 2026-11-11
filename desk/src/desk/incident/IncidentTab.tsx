import { useIncident } from "../../incident";
import { BreakdownTable } from "./BreakdownTable";
import { Containment } from "./Containment";
import { Investigation } from "./Investigation";
import { LogExcerpts } from "./LogExcerpts";
import { PatternFacts } from "./PatternFacts";
import { TimingTable } from "./TimingTable";
import { VerificationResult } from "./VerificationResult";

/** The incident in full: the pattern, the evidence behind it, the hypotheses, containment, and the day-20 result. */
export function IncidentTab() {
  const incident = useIncident();
  return (
    <div>
      <header>
        <p className="dk-kicker">{incident.id}</p>
        <h3 className="dk-h3">{incident.name}</h3>
      </header>
      <PatternFacts />
      <TimingTable />
      <LogExcerpts />
      <BreakdownTable />
      <Investigation />
      <Containment />
      <VerificationResult />
    </div>
  );
}
