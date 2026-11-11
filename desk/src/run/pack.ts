// The industry pack as the run model and the desk screens read it: the queue, the closed history and runbooks, the
// rules' offline answers, the recorded run the desk starts from, and the few words the queue screens need. EV
// charging is the default, so a caller that names no pack reads EV exactly as before. Other packs build theirs in
// src/packs/<pack>-desk.ts, loaded only when picked.
import labelsJson from "../../../docs/eval/reference-labels.json";
import {
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleTriage,
  ruleVerify,
  type RuleTriageResult,
  type ShiftSummary,
  type TriageTicket,
} from "../../functions/_lib/rules";
import type { PackId } from "../../shared/packs";
import { HISTORY, NEW_TICKET_EXAMPLE, RUNBOOKS, SITES, TICKETS } from "../data/synthetic";
import { fieldLabel } from "../packs/industry";
import { recordedRun } from "./recorded";
import type { ReferenceLabel } from "./score";
import type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  Run,
  ShiftnoteModel,
  VerifyModel,
} from "./types";

/** The ticket fields the desk reads. A pack's own ticket type adds its fields. */
export interface DeskTicket {
  id: string;
  /** Opened time, ET, e.g. "Mon 09:12". */
  opened: string;
  from: string;
  text: string;
  fw?: string;
}

export interface DeskHistory {
  id: string;
  /** Days back from today (0). */
  day: number;
  text: string;
  resolution: string;
  fw?: string;
}

export interface DeskRunbook {
  id: string;
  title: string;
  scope: string;
  recordOnly?: boolean;
}

/** One line of a ticket's facts in the inspector. */
export interface DeskField {
  label: string;
  value: string;
  mono?: boolean;
}

/** One of the queue table's two short columns after Source. */
export interface DeskColumn {
  label: string;
  value: (t: DeskTicket) => string;
}

/** Why an industry has no "Run it live" button yet. */
export const NO_LIVE_RUNS =
  "Live runs are off for this industry until its first recorded run has been reviewed. These answers come from the rules.";

export interface DeskPack {
  id: PackId;
  tickets: readonly DeskTicket[];
  history: readonly DeskHistory[];
  runbooks: readonly DeskRunbook[];
  newTicketExample: string;
  /** Named in every request the live chain sends. The default pack names none, so its requests stay as they were. */
  requestPack?: PackId;
  /** Live model calls are switched on for this pack (it has a reviewed recording). */
  liveRuns: boolean;
  /** The committed recorded run the desk starts from. */
  recorded: () => Run;
  /** The rules' answers, used when no model answers. */
  ruleTriage: (t: TriageTicket) => RuleTriageResult;
  ruleClassify: (text: string, article?: { title?: string } | null) => ClassifyModel;
  /** The rules' version of every incident step. */
  fallbacks: {
    investigate: () => InvestigationModel;
    handoff: () => HandoffModel;
    verify: () => VerifyModel;
    kb: () => KbModel;
    shiftnote: (summary?: ShiftSummary | null) => ShiftnoteModel;
  };
  /** Where a closed ticket came from (EV: its site), and what those places are called, plural. */
  placeOf: (h: DeskHistory) => string;
  placeWord: string;
  columns: readonly [DeskColumn, DeskColumn];
  /** The ticket's facts after "Raised by" in the inspector. */
  facts: (t: DeskTicket) => readonly DeskField[];
  /** What the record-only runbook does not change, after "it does not change". */
  heldNote: string;
  /** The check a person makes before the record-only runbook runs. */
  gate: { why: (runbook: string) => string; label: string; pending: string };
  /** The reviewed reference labels for the queue, and where they live in the repository. */
  labels: { labels: readonly ReferenceLabel[]; reviewed: string; path: string };
}

// The EV tickets carry their own fields; the desk reads them by name.
type EvTicket = (typeof TICKETS)[number];
type EvHistory = (typeof HISTORY)[number];
const ev = (t: DeskTicket) => t as EvTicket;

export const EV_DESK: DeskPack = {
  id: "ev-charging",
  tickets: TICKETS,
  history: HISTORY,
  runbooks: RUNBOOKS,
  newTicketExample: NEW_TICKET_EXAMPLE,
  liveRuns: true,
  recorded: recordedRun,
  ruleTriage,
  ruleClassify,
  fallbacks: {
    investigate: ruleInvestigate,
    handoff: ruleHandoff,
    verify: ruleVerify,
    kb: ruleKb,
    shiftnote: ruleShiftnote,
  },
  placeOf: (h) => (h as EvHistory).site,
  placeWord: "sites",
  columns: [
    { label: fieldLabel("ev-charging", "site", "Site"), value: (t) => (ev(t).site === "-" ? "–" : ev(t).site) },
    { label: fieldLabel("ev-charging", "fw", "Firmware"), value: (t) => (ev(t).fw === "-" ? "–" : ev(t).fw) },
  ],
  facts: (t) => {
    const { site, charger, fw } = ev(t);
    const out: DeskField[] = [];
    if (site !== "-")
      out.push({ label: fieldLabel("ev-charging", "site", "Site"), value: `${site} · ${SITES[site] ?? ""}` });
    if (charger !== "-")
      out.push(
        { label: fieldLabel("ev-charging", "charger", "Charger"), value: charger, mono: true },
        { label: fieldLabel("ev-charging", "fw", "Firmware"), value: fw, mono: true },
      );
    return out;
  },
  heldNote: "why the session stayed open",
  gate: {
    why: (runbook) =>
      `${runbook} closes at the last recorded meter value, so a person checks that the meter shows no energy change since unplug before it runs.`,
    label: "I checked the meter: no energy change since unplug",
    pending: "Not approvable until the meter is checked.",
  },
  labels: { labels: labelsJson.labels, reviewed: labelsJson.reviewed, path: "docs/eval/reference-labels.json" },
};
