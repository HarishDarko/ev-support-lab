import { META } from "../../data/synthetic";
import { DAY_MINUTES, HOUR_TICKS, coverageBands, minutes } from "./coverage";
import "./CoverageTab.css";

const pct = (minute: number) => `${(minute / DAY_MINUTES) * 100}%`;

/** Who is covering the network at each hour of the Eastern-time day. */
export function CoverageTab() {
  const bands = coverageBands();
  const start = minutes(META.shiftStart);
  const overlapMinutes = (bands.find((b) => b.id === "overlap")?.segments ?? []).reduce((n, [a, b]) => n + b - a, 0);

  return (
    <section aria-labelledby="coverage-heading">
      <h3 id="coverage-heading" className="dk-h3">
        Coverage over 24 hours, Eastern time
      </h3>
      <p className="dk-lede">
        The shift starts at {META.shiftStart}, {overlapMinutes} minutes before the India team finishes. The bars show
        who is on at each hour. Hours are synthetic and set by the prototype.
      </p>

      <div className="cov">
        <div className="cov-axis" aria-hidden="true">
          {HOUR_TICKS.map((h) => (
            <span key={h} className="cov-tick" style={{ left: pct(h * 60) }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        <ul className="dk-list dk-list--plain cov-rows">
          {bands.map((band) => (
            <li key={band.id} className="cov-row">
              <div className="cov-name">
                <span className="cov-label">{band.label}</span>
                <span className="cov-range dk-mono">{band.range}</span>
              </div>
              <div className="cov-track" aria-hidden="true">
                {HOUR_TICKS.map((h) => (
                  <span key={h} className="cov-grid" style={{ left: pct(h * 60) }} />
                ))}
                {band.segments.map(([from, to]) => (
                  <span
                    key={from}
                    className={`cov-bar cov-bar--${band.id}`}
                    style={{ left: pct(from), width: pct(to - from) }}
                  />
                ))}
                <span className="cov-start" style={{ left: pct(start) }} />
              </div>
              <p className="cov-detail">{band.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
