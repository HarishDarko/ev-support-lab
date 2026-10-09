// The 24-hour Eastern-time coverage strip. The hours come from the synthetic data (META) and the brief; the
// overlap and the evening are computed from them, not typed in.
import { META } from "../../data/synthetic";

const DAY = 24 * 60;

/** Minutes after midnight for "HH:MM". */
export function minutes(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) throw new Error(`Not a clock time: ${clock}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clock(minute: number): string {
  const m = ((minute % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** A stretch of the day in minutes after midnight. `end` may pass midnight (end < start). */
export interface Interval {
  start: number;
  end: number;
}

/** The pieces of an interval inside one day: a stretch that wraps midnight becomes two. */
export function segments({ start, end }: Interval): [number, number][] {
  if (start === end) return [[0, DAY]];
  return end > start
    ? [[start, end]]
    : [
        [start, DAY],
        [0, end],
      ];
}

/** The stretches where two intervals overlap, as day segments. */
export function overlap(a: Interval, b: Interval): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, a1] of segments(a))
    for (const [b0, b1] of segments(b)) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi > lo) out.push([lo, hi]);
    }
  return out;
}

export interface Band {
  id: "noc" | "india" | "shift" | "overlap" | "evening";
  label: string;
  /** What it means, in words. */
  detail: string;
  /** "HH:MM–HH:MM ET" or "24/7". */
  range: string;
  segments: [number, number][];
}

/** The shift is 07:00 to 15:30 ET (brief); it starts at META.shiftStart. */
const SHIFT_HOURS = 8.5;

export function coverageBands(): Band[] {
  const shift: Interval = { start: minutes(META.shiftStart), end: minutes(META.shiftStart) + SHIFT_HOURS * 60 };
  const [indiaFrom = "", indiaTo = ""] = META.indiaShiftET.replace(/\s*ET$/, "").split("–");
  const india: Interval = { start: minutes(indiaFrom), end: minutes(indiaTo) };
  const evening: Interval = { start: shift.end, end: india.start };
  const together = overlap(shift, india);
  const span = (i: Interval) => `${clock(i.start)}–${clock(i.end)} ET`;
  const first = together[0];

  return [
    {
      id: "noc",
      label: "NOC, levels 1 and 2",
      detail: "Watches alerts around the clock and escalates to customer care, field service and host accounts.",
      range: "24/7",
      segments: [[0, DAY]],
    },
    {
      id: "india",
      label: "India engineering",
      detail: "Their working day, in Eastern time. Engineering-level investigation has no one on Eastern hours.",
      range: span(india),
      segments: segments(india),
    },
    {
      id: "shift",
      label: "This shift",
      detail: "The Eastern-time production-support engineer.",
      range: span(shift),
      segments: segments(shift),
    },
    {
      id: "overlap",
      label: "Overlap",
      detail: "Live handover with the India engineering team before their day ends.",
      range: first ? `${clock(first[0])}–${clock(first[1])} ET` : "none",
      segments: together,
    },
    {
      id: "evening",
      label: "Evening",
      detail: "Automation keeps triaging. Urgent issues page on-call (proposed).",
      range: span(evening),
      segments: segments(evening),
    },
  ];
}

export const HOUR_TICKS: readonly number[] = [0, 3, 6, 9, 12, 15, 18, 21, 24];
export const DAY_MINUTES = DAY;
