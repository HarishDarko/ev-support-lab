import { HERO } from "../../data/synthetic";
import { Containment } from "./Containment";
import { FleetTable } from "./FleetTable";
import { Investigation } from "./Investigation";
import { LogExcerpts } from "./LogExcerpts";
import { PatternFacts } from "./PatternFacts";
import { TimingTable } from "./TimingTable";
import { VerificationResult } from "./VerificationResult";

/** The incident in full: the pattern, the evidence behind it, the hypotheses, containment, and the day-20 result. */
export function IncidentTab() {
  return (
    <div>
      <header>
        <p className="dk-kicker">{HERO.incidentId}</p>
        <h3 className="dk-h3">{HERO.name}</h3>
      </header>
      <PatternFacts />
      <TimingTable />
      <LogExcerpts />
      <FleetTable />
      <Investigation />
      <Containment />
      <VerificationResult />
    </div>
  );
}
