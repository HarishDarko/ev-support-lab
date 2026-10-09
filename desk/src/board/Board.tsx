import { LayoutGroup, motion } from "motion/react";
import { ENGINEERING_CHANGE } from "../data/synthetic";
import { LAB, source } from "../data/lab";
import { beatIndex, type BeatId, type Facts } from "../story/beats";
import type { StoryData } from "../story/data";
import { CoverageStrip } from "./Coverage";
import { FleetBars, OcppReplay, TimingPlot } from "./Evidence";
import { ArticleNode, HandoffNode, Hypotheses, LabNode, ProveNode, ResultBars } from "./Findings";
import { PatternNode } from "./PatternNode";
import { TileField } from "./TileField";
import { DUR, EASE, enter, stagger } from "./motion";
import "./Board.css";

interface Chip {
  id: string;
  /** The chip joins the trail once the story is past this beat. */
  after: BeatId;
  label: (f: Facts) => string;
  value: (f: Facts, data: StoryData, at: number) => string;
  tone?: (f: Facts) => "ok" | "attn" | undefined;
  /** The board node this chip was, so it can shrink into place. */
  node?: string;
}

const CHIPS: Chip[] = [
  { id: "queue", after: "t3", label: () => "Queue", value: (f) => `${f.total} tickets at 07:00` },
  {
    id: "triage",
    after: "t3",
    label: () => "Triage",
    value: (f) =>
      `${f.approvedCount ? `${f.approvedCount} closures approved` : `${f.lanes.close.length} closures awaiting a person`} · ${f.lanes.held.length} held`,
    tone: (f) => (f.approved ? "ok" : "attn"),
  },
  {
    id: "incident",
    after: "e1",
    node: "node-incident",
    label: (f) => f.incident.incidentId,
    value: (f, _d, at) =>
      at > beatIndex("e5")
        ? "2 hypotheses · not confirmed"
        : `${f.incident.totalTickets} tickets · ${f.incident.sites.length} sites`,
  },
  {
    id: "repro",
    after: "e6",
    node: "node-repro",
    label: () => "Reproduced",
    value: () => "late Ended ignored, on demand",
  },
  {
    id: "handoff",
    after: "v1",
    node: "node-handoff",
    label: () => "Handoff",
    value: (f) => (f.sent ? "sent to engineering" : "awaiting approval"),
    tone: (f) => (f.sent ? "ok" : "attn"),
  },
  {
    id: "fix",
    after: "v2",
    node: "node-fix",
    label: () => ENGINEERING_CHANGE.ref,
    value: (f) => `flag on ${f.v.canary.sites} canary sites`,
  },
  {
    id: "result",
    after: "v3",
    node: "node-result",
    label: (f) => `Day ${f.shippedDay + f.v.windowDays}`,
    value: (f) =>
      `canary ${f.v.canary.before.stuck} → ${f.v.canary.after.stuck} · control ${f.v.control.before.stuck} → ${f.v.control.after.stuck}`,
    tone: () => "ok",
  },
  { id: "article", after: "c1", node: "node-article", label: () => "Article", value: (_f, d) => d.kb.title },
];

interface Props {
  at: number;
  beat: BeatId;
  data: StoryData;
  f: Facts;
  onOpenTicket: (id: string) => void;
}

/** The evidence board: one focus for the current beat, and the trail of what came before. */
export function Board({ at, beat, data, f, onOpenTicket }: Props) {
  const chips = CHIPS.filter((c) => beatIndex(c.after) < at);
  const chain = beat === "c2";
  return (
    <LayoutGroup>
      <div className={`board${chips.length && !chain ? " board--trail" : ""}${chain ? " board--chain" : ""}`}>
        {chips.length > 0 && (
          <ol className={chain ? "trail trail--row" : "trail"} aria-label="So far">
            {chips.map((c, i) => {
              const tone = c.tone?.(f);
              return (
                <motion.li
                  key={c.id}
                  layoutId={c.node ?? `chip-${c.id}`}
                  className={`chip-node${tone ? ` chip-node--${tone}` : ""}`}
                  initial={c.node ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: DUR.slow, ease: EASE, delay: chain ? stagger(i, 0.06) : 0 }}
                >
                  <span className="chip-label">{c.label(f)}</span>
                  <span className="chip-value">{c.value(f, data, at)}</span>
                </motion.li>
              );
            })}
          </ol>
        )}
        <div className="focus">
          <Focus beat={beat} data={data} f={f} onOpenTicket={onOpenTicket} />
        </div>
      </div>
    </LayoutGroup>
  );
}

export function Focus({ beat, data, f, onOpenTicket }: Omit<Props, "at">) {
  const tiles = (mode: "source" | "lanes" | "lanes-held") => (
    <TileField mode={mode} tickets={data.tickets} approvedIds={f.approvedIds} onOpen={onOpenTicket} />
  );
  switch (beat) {
    case "q1":
      return tiles("source");
    case "q2":
      return (
        <div className="stack">
          {tiles("source")}
          <CoverageStrip />
        </div>
      );
    case "t1":
      return tiles("lanes");
    case "t2":
    case "t3":
      return (
        <div className="split split--lanes">
          {tiles("lanes-held")}
          <PatternNode expanded={false} f={f} onOpen={onOpenTicket} />
        </div>
      );
    case "e1":
      return <PatternNode expanded f={f} onOpen={onOpenTicket} />;
    case "e2":
      return <TimingPlot />;
    case "e3":
      return <OcppReplay which="late" />;
    case "e3b":
      return <OcppReplay which="lost" />;
    case "e4":
      return <FleetBars />;
    case "e5":
      return <Hypotheses data={data} f={f} />;
    case "e6":
      return <LabNode variant="repro" />;
    case "v1":
      return <HandoffNode data={data} sent={f.sent} />;
    case "v2":
      return <LabNode variant="fix" />;
    case "v3":
      return <ResultBars f={f} />;
    case "v4":
      return <ProveNode data={data} f={f} />;
    case "c1":
      return <ArticleNode data={data} />;
    case "c2":
      return <Summary data={data} f={f} />;
  }
}

function Summary({ data, f }: { data: StoryData; f: Facts }) {
  const numbers = [
    {
      n: String(f.approvedCount || f.lanes.close.length),
      text: f.approvedCount ? "closures approved by a person" : "closures awaiting a person",
    },
    { n: `${f.lanes.held.length} → 1`, text: "held tickets became one incident" },
    { n: `${f.v.canary.before.stuck} → ${f.v.canary.after.stuck}`, text: "stuck sessions on the canary sites" },
  ];
  const note = data.shiftnote;
  return (
    <div className="summary">
      <dl className="numbers">
        {numbers.map((x, i) => (
          <motion.div key={x.text} {...enter} transition={{ ...enter.transition, delay: 0.3 + i * 0.08 }}>
            <dt>{x.text}</dt>
            <dd>{x.n}</dd>
          </motion.div>
        ))}
      </dl>
      <div className="split">
        <motion.article className="node" {...enter} transition={{ ...enter.transition, delay: 0.5 }}>
          <p className="node-kicker">
            Handover note to India · 15:30 ET
            {!f.approved && <span className="chip chip--attn">Assumes the closures were approved</span>}
          </p>
          <p className="node-lead">{note.headline}</p>
          {note.needs_you.length > 0 && (
            <>
              <p className="node-sub">Needs you</p>
              <ul>
                {note.needs_you.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </motion.article>
        <motion.nav className="node" aria-label="Source" {...enter} transition={{ ...enter.transition, delay: 0.58 }}>
          <p className="node-kicker">The source</p>
          <ul className="source-links">
            <li>
              <a href={source(LAB.reproduction.path)} target="_blank" rel="noreferrer">
                The reproduction test
              </a>
            </li>
            <li>
              <a href={source(LAB.regression.path)} target="_blank" rel="noreferrer">
                The regression test
              </a>
            </li>
            {LAB.adrs.map((a) => (
              <li key={a.path}>
                <a href={source(a.path)} target="_blank" rel="noreferrer">
                  Decision record: {a.title}
                </a>
              </li>
            ))}
            <li>
              <a href={source("desk/functions/_lib/validate.ts")} target="_blank" rel="noreferrer">
                How AI output is checked
              </a>
            </li>
          </ul>
        </motion.nav>
      </div>
    </div>
  );
}
