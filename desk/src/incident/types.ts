// The neutral incident: everything the incident screens and the evidence and verification beats show, in one
// shape. A pack with an incident supplies one of these (src/incident/<pack>.ts); the screens read only this, so a
// new industry's incident is new data, not edits across the UI. Every text a pack writes is plain words; every
// number is computed from the pack's synthetic data or its lab's experiment, never typed into a screen.
import type { BeatId, Facts } from "../story/beats";

/** The beats whose texts an incident's pack writes: evidence, verification and the knowledge-base close. */
export type IncidentBeatId = Extract<
  BeatId,
  "e1" | "e2" | "e3" | "e3b" | "e4" | "e5" | "e6" | "v1" | "v2" | "v3" | "v4" | "c1"
>;

/** [time, actor, detail] */
export type LogLine = readonly [time: string, actor: string, detail: string];

export interface IncidentLog {
  title: string;
  lines: readonly LogLine[];
}

/** One table cell. `bar` draws a share bar (0 to 100) before the text. */
export interface Cell {
  text: string;
  num?: boolean;
  mono?: boolean;
  bar?: number;
}

export interface Column {
  label: string;
  num?: boolean;
}

/** A table whose first cell in each row is the row header. */
export interface Table {
  title: string;
  lede: string;
  caption: string;
  columns: readonly Column[];
  rows: readonly { key: string; cells: readonly Cell[] }[];
}

/** One value per ticket in the incident (for EV: seconds from unplug to connection drop). */
export interface TimingRow {
  id: string;
  group: string;
  value: number;
}

export interface Timing {
  title: string;
  /** The header of the id column, e.g. "Ticket". */
  idLabel: string;
  lede: string;
  caption: string;
  groupLabel: string;
  valueLabel: string;
  /** Screen-reader name of the bar column. */
  axisLabel: string;
  /** The bar and the plot run from 0 to this value. */
  axisMax: number;
  /** Where the board's plot draws grid lines. */
  ticks: readonly number[];
  unit: string;
  /** In the pack's own order; the screens sort them. */
  rows: readonly TimingRow[];
  plotCaption: string;
}

/** A flagged log line: its kind names the style (dropped, missing, ignored), the note says why. */
export interface LogFlag {
  kind: "dropped" | "missing" | "ignored";
  note: string;
}

export interface EscalationRule {
  key: string;
  text: string;
}

export interface Escalation {
  supportOwns: readonly string[];
  escalateWhenAny: readonly EscalationRule[];
  /** The keys of escalateWhenAny this incident crosses. */
  fired: readonly string[];
}

export interface DetectorRow {
  id: string;
  cells: readonly Cell[];
  candidate: boolean;
  reason: string;
}

export interface Detector {
  title: string;
  note: string;
  query: string;
  caption: string;
  /** The columns between the id column and the result column. */
  columns: readonly Column[];
  idLabel: string;
  rows: readonly DetectorRow[];
  summary: string;
}

/** A lab test run as the story shows it. */
export interface TestRun {
  className: string;
  flag: "on" | "off";
  path: string;
  /** [scenario, what the test asserts]. */
  cases: readonly (readonly [string, string])[];
}

export interface Lab {
  reproduction: TestRun;
  regression: TestRun;
  edgeCases: TestRun;
  /** The rules of the fix, as the decision records state them. */
  rules: readonly { name: string; text: string }[];
  adrs: readonly { title: string; path: string }[];
  readme: string;
  precedent: { title: string; url: string };
  /** The Gradle task that runs the lab's tests, e.g. ":lab:test". */
  testTask: string;
  reproKicker: string;
  fixKicker: string;
  /** What the reproduction test shows, after "It runs with the fix flag off and ...". */
  reproShows: string;
}

/** A line with a bold lead, e.g. "<strong>5 open sessions corrected</strong> under INC-0412: ...". */
export interface LeadLine {
  lead: string;
  rest: string;
}

export interface Incident {
  /** The pack it belongs to. */
  packId: string;
  id: string;
  name: string;
  openIds: readonly string[];
  historyIds: readonly string[];
  /** The pack's record-only runbook, the one the repeat rule holds. */
  recordOnlyRunbook: string;
  /** What the pack calls the places tickets come from, plural (for EV: "sites"). */
  placeWord: string;

  /** The pattern facts above the escalation line, before the record-only runbook's own row. */
  patternFacts: readonly (readonly [value: string, label: string, detail: string])[];
  /** The facts on the board's incident node. */
  boardFacts: readonly (readonly [label: string, value: string])[];
  escalation: Escalation;
  timing: Timing;
  logs: { title: string; lede: string; excerpts: readonly IncidentLog[]; flag: (detail: string) => LogFlag | null };
  /** The log excerpts the board replays, beat by beat, as the lab captured them. */
  replays: {
    excerpts: readonly IncidentLog[];
    tone: (detail: string) => "bad" | "attn" | undefined;
    beats: Partial<Record<BeatId, { ticket: string; note: string }>>;
    caption: string;
  };
  breakdown: Table;
  /** The breakdown as the board draws it: bar length, filled share, the count, and context. */
  bars: {
    caption: string;
    columns: readonly [string, string, string, string];
    /** `key` is also the row header. */
    rows: readonly { key: string; length: number; fill: number; strong: string; of: string; muted: string }[];
    figcaption: string;
  };
  ruledOut: readonly string[];
  containment: {
    title: string;
    lines: readonly string[];
    /** The board's "Support acts now" card. */
    board: readonly LeadLine[];
    boardCaption: (heldRunbook: string) => string;
  };
  detector: Detector;
  change: { ref: string; shippedDay: number; summary: string; rollout: string };
  verification: {
    windowDays: number;
    caption: string;
    columns: readonly Column[];
    rows: readonly { name: string; cells: readonly string[] }[];
    note: string;
    differences: readonly { metric: string; expected: number; computed: number }[];
    checksTitle: string;
    checks: readonly (readonly [string, string])[];
    /** The board's canary and control bars. */
    bars: {
      groups: readonly {
        name: string;
        tone: "ok" | "bad";
        arms: readonly { label: "Before" | "After"; value: number; context: string }[];
      }[];
      unit: string;
      /** After the canary outcome sentence. */
      caption: string;
    };
    /** The board's "checks that held" card. */
    held: { title: string; lines: readonly string[] };
  };
  lab: Lab;
  handoff: {
    /** After "The attachments are in the Incident tab: ". */
    attachmentsNote: string;
    /** Extra Markdown sections of the packet, after the hypothesis note. */
    markdown: readonly string[];
  };
  /** What the board's trail and summary say. */
  board: {
    incidentValue: (pastHypotheses: boolean) => string;
    reproValue: string;
    fixValue: string;
    resultValue: string;
    summary: { n: string; text: string };
  };
  /** The facts the pack's own beat texts read, added to the story's Facts as they are. */
  storyFacts: Record<string, unknown>;
  /** The pack's texts for the evidence, verification and close beats. */
  beats: Record<IncidentBeatId, { claim: (f: Facts) => string; lede: (f: Facts) => string }>;
  /** What happened on the canary, in words (the v3 beat and the board's result caption). */
  canaryOutcome: (f: Facts) => string;
  /** The escalation triggers as words, for the e1 beat. */
  triggerWords: readonly string[];
}
