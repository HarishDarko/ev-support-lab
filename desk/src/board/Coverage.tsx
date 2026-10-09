import { motion } from "motion/react";
import { enter } from "./motion";

type Span = [from: number, to: number];
interface Row {
  name: string;
  hours: string;
  spans: Span[];
  kind: "noc" | "india" | "shift" | "evening";
}

// Eastern time, 24 hours. Source: docs/design/brief.md (Coverage).
const ROWS: Row[] = [
  { name: "NOC, levels 1 and 2", hours: "24/7", spans: [[0, 24]], kind: "noc" },
  { name: "India engineering", hours: "23:30–08:30", spans: [[0, 8.5], [23.5, 24]], kind: "india" }, // prettier-ignore
  { name: "This shift", hours: "07:00–15:30", spans: [[7, 15.5]], kind: "shift" },
  {
    name: "Evening: automation triages, urgent issues page on-call",
    hours: "15:30–23:30",
    spans: [[15.5, 23.5]],
    kind: "evening",
  },
];
const OVERLAP: Span = [7, 8.5];
const pct = (h: number) => `${(h / 24) * 100}%`;

/** The 24-hour Eastern-time coverage strip, with the live overlap marked across every row. */
export function CoverageStrip({ size = "board" }: { size?: "board" | "full" }) {
  return (
    <motion.figure className={`node coverage coverage--${size}`} {...enter}>
      <div className="coverage-grid">
        <div className="coverage-overlap" style={{ left: pct(OVERLAP[0]), width: pct(OVERLAP[1] - OVERLAP[0]) }}>
          <span>Overlap · 90 min</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.name} className="coverage-row">
            <p className="coverage-name">
              {r.name} <span className="mono muted">{r.hours}</span>
            </p>
            <div className="coverage-track">
              {r.spans.map(([a, b]) => (
                <span
                  key={a}
                  className={`coverage-span coverage-span--${r.kind}`}
                  style={{ left: pct(a), width: pct(b - a) }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="coverage-axis" aria-hidden="true">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <span key={h} style={{ left: pct(h) }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="caption">
        Eastern time. The 07:00–08:30 overlap is a live handover with India engineering.
      </figcaption>
    </motion.figure>
  );
}
