import { motion } from "motion/react";
import { HERO } from "../data/synthetic";
import { experiment } from "../data/experiment";
import type { LogLine } from "../data/synthetic";
import { DUR, EASE, enter, stagger } from "./motion";

// ---- e2: unplug-to-drop timing ----

const W = 640;
const PAD_L = 64;
const PAD_R = 24;
const AXIS_MAX = 90;
const x = (s: number) => PAD_L + (s / AXIS_MAX) * (W - PAD_L - PAD_R);

export function TimingPlot() {
  const rows = [...new Set(HERO.unplugToDropSec.map((d) => d.fw))];
  const rowY = (fw: string) => 44 + rows.indexOf(fw) * 44;
  const sorted = [...HERO.unplugToDropSec].sort((a, b) => a.s - b.s);
  const h = 44 + rows.length * 44 + 20;
  return (
    <motion.figure className="node node-figure" {...enter}>
      <svg viewBox={`0 0 ${W} ${h}`} className="plot" role="img" aria-labelledby="timing-cap">
        {[0, 30, 60, 90].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={20} y2={h - 24} className={t === AXIS_MAX ? "plot-limit" : "plot-grid"} />
            <text x={x(t)} y={h - 6} className="plot-tick" textAnchor="middle">
              {t} s
            </text>
          </g>
        ))}
        {rows.map((fw) => (
          <text key={fw} x={PAD_L - 14} y={rowY(fw) + 4} className="plot-label" textAnchor="end">
            {fw}
          </text>
        ))}
        {sorted.map((d, i) => (
          <motion.circle
            key={d.id}
            cx={x(d.s)}
            cy={rowY(d.fw)}
            r={6}
            className="plot-dot"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.base, ease: EASE, delay: 0.15 + stagger(i, 0.05) }}
          >
            <title>{`${d.id}, ${d.fw}: ${d.s} s`}</title>
          </motion.circle>
        ))}
      </svg>
      <figcaption id="timing-cap" className="caption">
        Seconds from unplug to the websocket drop, one dot per stuck session (n = {HERO.unplugToDropSec.length}).
      </figcaption>
    </motion.figure>
  );
}

// ---- e3: the OCPP replay ----

const logFor = (ticket: string) => experiment.logs.find((l) => l.title.includes(ticket));

function lineTone([, , detail]: LogLine): "bad" | "attn" | undefined {
  if (/ignored/i.test(detail)) return "bad";
  if (/no TransactionEvent Ended received/i.test(detail)) return "attn";
  return undefined;
}

function Replay({ ticket, start, step, note }: { ticket: string; start: number; step: number; note: string }) {
  const log = logFor(ticket);
  if (!log) return null;
  return (
    <figure className="replay">
      <figcaption className="replay-title">
        <span className="mono">{log.title}</span>
        <span className="replay-note">{note}</span>
      </figcaption>
      <ol className="log">
        {log.lines.map((line, i) => {
          const tone = lineTone(line);
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

/** One gateway excerpt per beat: FW-A, where a late Ended is ignored, then FW-B, where none arrives. */
export function OcppReplay({ which }: { which: "late" | "lost" }) {
  return (
    <motion.div key={which} className="node node-replay" {...enter}>
      {which === "late" ? (
        <Replay ticket="T-2058" start={0.1} step={0.09} note="FW-A · the Ended arrives late and is ignored" />
      ) : (
        <Replay ticket="T-2041" start={0.1} step={0.09} note="FW-B · no Ended arrives" />
      )}
      <p className="caption">Synthetic OCPP 2.0.1 gateway summaries. Charger-side logs are not available to support.</p>
    </motion.div>
  );
}

// ---- e4: the fleet by firmware ----

export function FleetBars() {
  const rows = experiment.fleet;
  const max = Math.max(...rows.map((r) => r.dropsNearUnplug));
  return (
    <motion.figure className="node node-figure" {...enter}>
      <table className="fleet">
        <caption className="sr-only">Drops near unplug and stuck sessions by firmware line, 21 days</caption>
        <thead>
          <tr>
            <th scope="col">Firmware</th>
            <th scope="col">Drops near unplug that ended stuck</th>
            <th scope="col" className="num">
              Stuck
            </th>
            <th scope="col" className="num">
              Sessions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.fw}>
              <th scope="row" className="mono">
                {r.fw}
              </th>
              <td>
                <span className="fleet-bar" style={{ width: `${(r.dropsNearUnplug / max) * 100}%` }}>
                  <motion.span
                    className="fleet-fill"
                    style={{ width: `${r.dropsNearUnplug ? (r.stuck / r.dropsNearUnplug) * 100 : 0}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE, delay: 0.2 + i * 0.08 }}
                  />
                </span>
              </td>
              <td className="num">
                <strong>{r.stuck}</strong> of {r.dropsNearUnplug}
              </td>
              <td className="num muted">{r.sessions.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="caption">
        Bar length: drops within 90 s of unplug. Filled: the ones that left a session open. 21 days.
      </figcaption>
    </motion.figure>
  );
}
