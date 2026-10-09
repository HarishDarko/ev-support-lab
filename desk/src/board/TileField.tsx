import { motion } from "motion/react";
import { useState } from "react";
import { TICKETS } from "../data/synthetic";
import type { Lane, TicketView } from "../story/data";
import { EASE, stagger } from "./motion";

export type TileMode = "source" | "lanes" | "lanes-held";

const LANE_NAMES: Record<Lane, string> = {
  close: "Close with runbook",
  held: "Held by the repeat rule",
  person: "Needs a person",
  escalate: "Escalation candidate",
  info: "Info only",
};
const LANE_ORDER: Lane[] = ["close", "held", "person", "escalate", "info"];

const SOURCE_NAMES: Record<string, string> = {
  "NOC alert": "NOC",
  "Platform alert": "Platform alerts",
};
const sourceOrder = [...new Set(TICKETS.map((t) => t.from))].sort(
  (a, b) => TICKETS.filter((t) => t.from === b).length - TICKETS.filter((t) => t.from === a).length,
);

interface Props {
  mode: TileMode;
  tickets: TicketView[];
  /** Closures a person approved; their tiles turn green. */
  approvedIds: string[];
  /** Opens the ticket in the desk. */
  onOpen: (id: string) => void;
}

/** The 40 tickets as tiles. The same tile (layoutId) travels from its source group into its lane. */
export function TileField({ mode, tickets, approvedIds, onOpen }: Props) {
  const approved = new Set(approvedIds);
  const [focused, setFocused] = useState<string | null>(null);
  const byId = new Map(tickets.map((t) => [t.id, t]));

  const groups: { key: string; name: string; ids: string[]; lane?: Lane }[] =
    mode === "source"
      ? sourceOrder.map((s) => ({
          key: s,
          name: SOURCE_NAMES[s] ?? s,
          ids: TICKETS.filter((t) => t.from === s).map((t) => t.id),
        }))
      : LANE_ORDER.filter((l) => !(mode === "lanes-held" && l === "held")).map((l) => ({
          key: l,
          name: LANE_NAMES[l],
          lane: l,
          ids: tickets.filter((t) => t.lane === l).map((t) => t.id),
        }));

  const order = new Map(TICKETS.map((t, i) => [t.id, i]));
  const shown = focused ? byId.get(focused) : undefined;

  return (
    <div className="tiles">
      <div className={`tile-groups tile-groups--${mode === "source" ? "source" : "lanes"}`}>
        {groups.map((g) => (
          <section
            key={g.key}
            className={`tile-group${g.lane ? ` lane-${g.lane}` : ""}`}
            aria-label={`${g.name}: ${g.ids.length}`}
          >
            <h3 className="tile-group-head">
              <span>{g.name}</span>
              <span className="tile-count">{g.ids.length}</span>
            </h3>
            <ul className="tile-list">
              {g.ids.map((id) => {
                const t = byId.get(id);
                return (
                  <Tile
                    key={id}
                    id={id}
                    delay={stagger(order.get(id) ?? 0)}
                    tone={
                      mode === "source" || !t ? undefined : t.lane === "close" && approved.has(t.id) ? "ok" : t.lane
                    }
                    onFocus={() => setFocused(id)}
                    onOpen={() => onOpen(id)}
                    label={
                      mode === "source"
                        ? id
                        : `${id}, ${LANE_NAMES[t?.lane ?? "person"]}${t?.runbook && t.runbook !== "none" ? `, ${t.runbook}` : ""}`
                    }
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {mode !== "source" && (
        <p className="tile-readout" aria-live="polite">
          {shown ? (
            <>
              <span className="mono">{shown.id}</span>
              <span className="tile-readout-sep" aria-hidden="true">
                ·
              </span>
              <span>{LANE_NAMES[shown.lane]}</span>
              {shown.runbook !== "none" && <span className="mono">{shown.runbook}</span>}
              <q className={shown.provenance === "ai" ? "quote-ai" : "quote-rules"}>{shown.quote}</q>
              <span className={shown.provenance === "ai" ? "prov" : "prov prov--rules"}>
                {shown.provenance === "ai" ? "AI, checked" : "Rules"}
              </span>
            </>
          ) : (
            <span className="muted">
              Point at a ticket to see the words its decision rests on. Select it to open the desk.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

interface TileProps {
  id: string;
  tone: Lane | "ok" | undefined;
  delay: number;
  label: string;
  onFocus: () => void;
  onOpen: () => void;
}

export function Tile({ id, tone, delay, label, onFocus, onOpen }: TileProps) {
  return (
    <motion.li layout layoutId={`tile-${id}`} transition={{ layout: { duration: 0.35, ease: EASE, delay } }}>
      <button
        type="button"
        className={`tile${tone ? ` tile--${tone}` : ""}`}
        aria-label={label}
        onMouseEnter={onFocus}
        onFocus={onFocus}
        onClick={onOpen}
      >
        {id.replace("T-", "")}
      </button>
    </motion.li>
  );
}
