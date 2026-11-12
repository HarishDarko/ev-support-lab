import { motion } from "motion/react";
import type { BeatId } from "../story/beats";
import type { Incident } from "../incident/types";
import { DUR, EASE, enter, stagger } from "./motion";

// ---- e2: the incident's timing ----

const W = 640;
const PAD_L = 64;
const PAD_R = 24;

export function TimingPlot({ incident }: { incident: Incident }) {
  const timing = incident.timing;
  const x = (s: number) => PAD_L + (s / timing.axisMax) * (W - PAD_L - PAD_R);
  const rows = [...new Set(timing.rows.map((d) => d.group))];
  const rowY = (group: string) => 44 + rows.indexOf(group) * 44;
  const sorted = [...timing.rows].sort((a, b) => a.value - b.value);
  const h = 44 + rows.length * 44 + 20;
  return (
    <motion.figure className="node node-figure" {...enter}>
      <svg viewBox={`0 0 ${W} ${h}`} className="plot" role="img" aria-labelledby="timing-cap">
        {timing.ticks.map((t) => (
          <g key={t}>
            <line
              x1={x(t)}
              x2={x(t)}
              y1={20}
              y2={h - 24}
              className={t === timing.axisMax ? "plot-limit" : "plot-grid"}
            />
            <text x={x(t)} y={h - 6} className="plot-tick" textAnchor="middle">
              {t} {timing.unit}
            </text>
          </g>
        ))}
        {rows.map((group) => (
          <text key={group} x={PAD_L - 14} y={rowY(group) + 4} className="plot-label" textAnchor="end">
            {group}
          </text>
        ))}
        {sorted.map((d, i) => (
          <motion.circle
            key={d.id}
            cx={x(d.value)}
            cy={rowY(d.group)}
            r={6}
            className="plot-dot"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.base, ease: EASE, delay: 0.15 + stagger(i, 0.05) }}
          >
            <title>{`${d.id}, ${d.group}: ${d.value} ${timing.unit}`}</title>
          </motion.circle>
        ))}
      </svg>
      <figcaption id="timing-cap" className="caption">
        {timing.plotCaption}
      </figcaption>
    </motion.figure>
  );
}

// ---- e3: the log replay ----

interface ReplayProps {
  incident: Incident;
  ticket: string;
  start: number;
  step: number;
  note: string;
}

function Replay({ incident, ticket, start, step, note }: ReplayProps) {
  const log = incident.replays.excerpts.find((l) => l.title.includes(ticket));
  if (!log) return null;
  return (
    <figure className="replay">
      <figcaption className="replay-title">
        <span className="mono">{log.title}</span>
        <span className="replay-note">{note}</span>
      </figcaption>
      <ol className="log">
        {log.lines.map((line, i) => {
          const tone = incident.replays.tone(line[2]);
          const delay = start + i * step;
          return (
            <motion.li
              key={`${line[0]}-${i}`}
              className={`log-line${tone ? ` log-line--${tone}` : ""}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DUR.fast, ease: EASE, delay }}
            >
              <span className="log-time">{line[0]}</span>
              <span className="log-actor">{line[1]}</span>
              <span className="log-detail">
                {line[2] || "—"}
                {tone === "bad" && (
                  <motion.span
                    className="strike"
                    aria-hidden="true"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE, delay: delay + 0.1 }}
                  />
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </figure>
  );
}

/** The log excerpt the incident replays at this beat. */
export function LogReplay({ incident, beat }: { incident: Incident; beat: BeatId }) {
  const replay = incident.replays.beats[beat];
  return (
    <motion.div key={beat} className="node node-replay" {...enter}>
      {replay && <Replay incident={incident} ticket={replay.ticket} start={0.1} step={0.09} note={replay.note} />}
      <p className="caption">{incident.replays.caption}</p>
    </motion.div>
  );
}

// ---- e4: the breakdown ----

export function BreakdownBars({ incident }: { incident: Incident }) {
  const { caption, columns, rows, figcaption } = incident.bars;
  return (
    <motion.figure className="node node-figure" {...enter}>
      <table className="fleet">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{columns[0]}</th>
            <th scope="col">{columns[1]}</th>
            <th scope="col" className="num">
              {columns[2]}
            </th>
            <th scope="col" className="num">
              {columns[3]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <th scope="row" className="mono">
                {r.key}
              </th>
              <td>
                <span className="fleet-bar" style={{ width: `${r.length}%` }}>
                  <motion.span
                    className="fleet-fill"
                    style={{ width: `${r.fill}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE, delay: 0.2 + i * 0.08 }}
                  />
                </span>
              </td>
              <td className="num">
                <strong>{r.strong}</strong> of {r.of}
              </td>
              <td className="num muted">{r.muted}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="caption">{figcaption}</figcaption>
    </motion.figure>
  );
}
