// The walkthrough as data: five stages, sixteen beats, one point each (docs/specs/desk-phase2.md, section 2).
// Every number in a claim is computed here from the synthetic data or the run, never typed into the UI.
import { TICKETS } from "../data/synthetic";
import { EV_INCIDENT } from "../incident/ev-charging";
import type { Incident, IncidentBeatId } from "../incident/types";
import type { Stage } from "../stages";
import { needsMeterCheck } from "../run/guardrail";
import { priorUses, REPEAT_LIMIT, WINDOW_DAYS, type Lane, type StoryData } from "./data";

export type DeskTab = "queue" | "incident" | "handoff" | "kb" | "coverage" | "scorecard";

export type BeatId =
  | "q1" | "q2"
  | "t1" | "t2" | "t3"
  | "e1" | "e2" | "e3" | "e3b" | "e4" | "e5" | "e6"
  | "v1" | "v2" | "v3" | "v4"
  | "c1" | "c2"; // prettier-ignore

export interface Beat {
  id: BeatId;
  stage: Stage["id"];
  /** Kicker time, e.g. "Day 0 · 07:00 ET". */
  when: (f: Facts) => string;
  claim: (f: Facts) => string;
  lede: (f: Facts) => string;
  /** The desk tab that holds this beat's evidence. */
  desk: DeskTab;
  /** The one primary action this beat asks a person to take, if any. */
  action?: "approve" | "send";
}

/** What the person has decided so far in this visit. */
export interface Decisions {
  /** Closures a person approved. */
  approvedIds: string[];
  sent: boolean;
  /** Tickets where a person confirmed the meter shows no energy change since unplug (v1's gate before RB-05). */
  meterChecked: string[];
}

export interface Facts extends Decisions {
  /** Every closure that can be approved now has been. */
  approved: boolean;
  approvedCount: number;
  /** Close-lane tickets a person may approve now. */
  approvable: string[];
  /** Close-lane tickets with a record-only runbook whose meter nobody has confirmed yet: not approvable. */
  awaitingMeter: string[];
  total: number;
  lanes: Record<Lane, string[]>;
  heldRunbook: string;
  prior: number;
  priorSites: number;
  incident: Incident;
  triggers: string[];
  shippedDay: number;
  /** The pack's own numbers behind its beat texts (Incident.storyFacts), kept here so the story shows them. */
  [key: string]: unknown;
}

const LANES: Lane[] = ["close", "person", "escalate", "info", "held"];

export function facts(data: StoryData, decisions: Decisions, incident: Incident = EV_INCIDENT): Facts {
  const lanes = Object.fromEntries(LANES.map((l) => [l, [] as string[]])) as Record<Lane, string[]>;
  for (const t of data.tickets) lanes[t.lane].push(t.id);
  const heldRunbook = data.tickets.find((t) => t.lane === "held")?.runbook ?? incident.recordOnlyRunbook;
  const prior = priorUses(heldRunbook);
  // The meter gate (v1, kept): a record-only runbook closes at the last recorded meter value, so a person confirms
  // the meter is flat before such a closure can be approved.
  const runbookOf = new Map(data.tickets.map((t) => [t.id, t.runbook]));
  const checked = new Set(decisions.meterChecked);
  const gated = (id: string) => needsMeterCheck(runbookOf.get(id) ?? "none") && !checked.has(id);
  const approvable = lanes.close.filter((id) => !gated(id));
  const awaitingMeter = lanes.close.filter(gated);
  const approvedSet = new Set(decisions.approvedIds);
  const approvedCount = lanes.close.filter((id) => approvedSet.has(id)).length;
  return {
    ...decisions,
    approved: approvable.length > 0 && approvable.every((id) => approvedSet.has(id)),
    approvedCount,
    approvable,
    awaitingMeter,
    total: TICKETS.length,
    lanes,
    heldRunbook,
    prior: prior.length,
    priorSites: new Set(prior.map((h) => h.site)).size,
    incident,
    triggers: [...incident.triggerWords],
    ...incident.storyFacts,
    shippedDay: incident.change.shippedDay,
  };
}

/** What happened on the canary, in the pack's words. */
export const canaryOutcome = (f: Facts): string => f.incident.canaryOutcome(f);

/** A beat whose text belongs to the incident's pack. */
const fromIncident = (id: IncidentBeatId) => ({
  claim: (f: Facts) => f.incident.beats[id].claim(f),
  lede: (f: Facts) => f.incident.beats[id].lede(f),
});

const day0 = () => "Day 0";
const shiftStart = () => "Day 0 · 07:00 ET";

export const BEATS: readonly Beat[] = [
  {
    id: "q1",
    stage: "queue",
    when: shiftStart,
    claim: (f) => `${f.total} tickets are waiting.`,
    lede: () =>
      "Raised overnight by the NOC, customer care, field service, host accounts and billing. Each needs an engineering-level look.",
    desk: "queue",
  },
  {
    id: "q2",
    stage: "queue",
    when: shiftStart,
    claim: () => "The first 90 minutes overlap with India engineering.",
    lede: () =>
      "Handover happens live, 07:00 to 08:30. After 15:30, automation keeps triaging and urgent issues page on-call.",
    desk: "coverage",
  },
  {
    id: "t1",
    stage: "triage",
    when: shiftStart,
    claim: () => "Every ticket read. Every decision quoted.",
    lede: (f) =>
      `The AI proposes an action for each of the ${f.total} and quotes the words it relied on. A quote that is not in the ticket is rejected.`,
    desk: "queue",
  },
  {
    id: "t2",
    stage: "triage",
    when: shiftStart,
    claim: (f) =>
      `${f.lanes.held.length} closures held. ${f.heldRunbook} has closed this ${f.prior} times in ${WINDOW_DAYS} days.`,
    lede: (f) =>
      `${f.heldRunbook} only corrects the record. Past ${REPEAT_LIMIT} uses in ${WINDOW_DAYS} days, the tickets stay open and become a pattern.`,
    desk: "queue",
  },
  {
    id: "t3",
    stage: "triage",
    when: shiftStart,
    claim: (f) =>
      f.approved
        ? `${f.approvedCount} closures approved by a person.`
        : `A person approves the ${f.approvable.length} closures.`,
    lede: (f) =>
      f.awaitingMeter.length
        ? `Nothing closes on the AI's word. ${f.awaitingMeter.length} more wait until a person confirms the meter in the desk.`
        : "Nothing closes on the AI's word. Every closure names a real runbook.",
    desk: "queue",
    action: "approve",
  },
  {
    id: "e1",
    stage: "evidence",
    when: day0,
    ...fromIncident("e1"),
    desk: "incident",
  },
  {
    id: "e2",
    stage: "evidence",
    when: day0,
    ...fromIncident("e2"),
    desk: "incident",
  },
  {
    id: "e3",
    stage: "evidence",
    when: day0,
    ...fromIncident("e3"),
    desk: "incident",
  },
  {
    id: "e3b",
    stage: "evidence",
    when: day0,
    ...fromIncident("e3b"),
    desk: "incident",
  },
  {
    id: "e4",
    stage: "evidence",
    when: day0,
    ...fromIncident("e4"),
    desk: "incident",
  },
  {
    id: "e5",
    stage: "evidence",
    when: day0,
    ...fromIncident("e5"),
    desk: "incident",
  },
  {
    id: "e6",
    stage: "evidence",
    when: day0,
    ...fromIncident("e6"),
    desk: "incident",
  },
  {
    id: "v1",
    stage: "verification",
    when: day0,
    ...fromIncident("v1"),
    desk: "handoff",
    action: "send",
  },
  {
    id: "v2",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay}`,
    ...fromIncident("v2"),
    desk: "handoff",
  },
  {
    id: "v3",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay + f.incident.verification.windowDays}`,
    ...fromIncident("v3"),
    desk: "handoff",
  },
  {
    id: "v4",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay + f.incident.verification.windowDays}`,
    ...fromIncident("v4"),
    desk: "handoff",
  },
  {
    id: "c1",
    stage: "close",
    when: () => "The next ticket",
    ...fromIncident("c1"),
    desk: "kb",
  },
  {
    id: "c2",
    stage: "close",
    when: () => "The whole chain",
    claim: () => "One shift, one chain.",
    lede: () => "Every step is in the desk, with its evidence, and in the repository, with its tests.",
    desk: "kb",
  },
];

export const beatIndex = (id: BeatId) => BEATS.findIndex((b) => b.id === id);
export const firstBeatOf = (stage: Stage["id"]) => BEATS.findIndex((b) => b.stage === stage);
