import { motion } from "motion/react";
import { ESCALATION_LINE, HERO } from "../data/synthetic";
import { REPEAT_LIMIT, WINDOW_DAYS } from "../story/data";
import type { Facts } from "../story/beats";
import { Tile } from "./TileField";
import { EASE, stagger } from "./motion";

const fwSplit = () => {
  const counts = new Map<string, number>();
  for (const d of HERO.unplugToDropSec) counts.set(d.fw, (counts.get(d.fw) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

interface Props {
  expanded: boolean;
  f: Facts;
  onOpen: (id: string) => void;
}

/**
 * The held tickets gathered into one pattern (Triage), which then grows into the incident (Evidence).
 * One layoutId carries it across both stages.
 */
export function PatternNode({ expanded, f, onOpen }: Props) {
  const held = f.lanes.held;
  return (
    <motion.article
      layoutId="node-incident"
      className={`node node-pattern${expanded ? " node-pattern--open" : ""}`}
      transition={{ layout: { duration: 0.35, ease: EASE } }}
      aria-label={expanded ? `Incident ${f.incident.incidentId}` : "Held pattern"}
    >
      <motion.p layout="position" className="node-kicker">
        {expanded ? `${f.incident.incidentId} · Incident` : "Pattern · held"}
      </motion.p>
      <motion.h3 layout="position" className="node-title">
        {f.incident.name}
      </motion.h3>

      {expanded && (
        <motion.dl className="facts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div>
            <dt>Tickets</dt>
            <dd>{f.incident.totalTickets}</dd>
          </div>
          <div>
            <dt>Sites</dt>
            <dd>{f.incident.sites.length}</dd>
          </div>
          <div>
            <dt>Days</dt>
            <dd>{-f.incident.firstSeenDay}</dd>
          </div>
          {fwSplit().map(([fw, n]) => (
            <div key={fw}>
              <dt>{fw}</dt>
              <dd>{n}</dd>
            </div>
          ))}
        </motion.dl>
      )}

      <ul className="tile-list tile-list--pattern" aria-label={expanded ? "Linked tickets" : "Held tickets"}>
        {held.map((id, i) => (
          <Tile
            key={id}
            id={id}
            tone="held"
            delay={stagger(i, 0.04)}
            label={`${id}, held`}
            onFocus={() => undefined}
            onOpen={() => onOpen(id)}
          />
        ))}
        {expanded &&
          f.incident.historyIds.map((id, i) => (
            <motion.li
              key={id}
              className="tile tile--history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 + stagger(i, 0.03) }}
              title={`${id}, closed earlier with ${f.heldRunbook}`}
            >
              {id.replace("H-", "")}
            </motion.li>
          ))}
      </ul>

      {expanded ? (
        <motion.div
          className="escalation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <p className="node-sub">The escalation line · proposed</p>
          <ul className="checks">
            {ESCALATION_LINE.escalateWhenAny.map((r) => {
              const fired = ESCALATION_LINE.heroTriggers.includes(r.key);
              return (
                <li key={r.key} className={fired ? "check check--fired" : "check"}>
                  <span className="check-mark" aria-hidden="true">
                    {fired ? "✓" : ""}
                  </span>
                  {r.text}
                  <span className="sr-only">{fired ? ": crossed" : ": not crossed"}</span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ) : (
        <motion.div layout="position" className="node-body">
          <p>
            {f.heldRunbook} closed this symptom {f.prior} times in {WINDOW_DAYS} days at {f.priorSites} sites, each time
            as a one-off.
          </p>
          <p className="node-rule">
            Rule: a record-only runbook is not applied again after {REPEAT_LIMIT} closures in its scope in {WINDOW_DAYS}{" "}
            days.
          </p>
        </motion.div>
      )}
    </motion.article>
  );
}
