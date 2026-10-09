// The walkthrough as data: five stages, sixteen beats, one point each (docs/specs/desk-phase2.md, section 2).
// Every number in a claim is computed here from the synthetic data or the run, never typed into the UI.
import { ENGINEERING_CHANGE, ESCALATION_LINE, HERO, TICKETS } from "../data/synthetic";
import { experiment } from "../data/experiment";
import { LAB } from "../data/lab";
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
  incident: typeof HERO;
  triggers: string[];
  drop: { min: number; max: number; n: number };
  fleet: typeof HERO.fleet;
  v: typeof experiment.verification;
  shippedDay: number;
}

const LANES: Lane[] = ["close", "person", "escalate", "info", "held"];

const TRIGGER_WORDS: Record<string, (f: Pick<Facts, "incident">) => string> = {
  code: () => "it needs a code change",
  spread: (f) => `it spans ${f.incident.sites.length} sites`,
  billing: () => "billing is at risk",
  safety: () => "there is a safety concern",
};

export function facts(data: StoryData, decisions: Decisions): Facts {
  const lanes = Object.fromEntries(LANES.map((l) => [l, [] as string[]])) as Record<Lane, string[]>;
  for (const t of data.tickets) lanes[t.lane].push(t.id);
  const heldRunbook = data.tickets.find((t) => t.lane === "held")?.runbook ?? "RB-05";
  const prior = priorUses(heldRunbook);
  const secs = HERO.unplugToDropSec.map((d) => d.s);
  const incident = HERO;
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
    triggers: ESCALATION_LINE.heroTriggers.map((k) => TRIGGER_WORDS[k]!({ incident })),
    drop: { min: Math.min(...secs), max: Math.max(...secs), n: secs.length },
    fleet: experiment.fleet,
    v: experiment.verification,
    shippedDay: ENGINEERING_CHANGE.shippedDay,
  };
}

const list = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const ofDrops = (f: Facts, i: number) => {
  const row = f.fleet[i]!;
  return `${row.fw.split(" ")[0]}: ${row.stuck} of ${row.dropsNearUnplug}`;
};
/** Rounds the slowest drop up to the next 30 s, the unit the detector and the article use. */
const window30 = (s: number) => Math.ceil(s / 30) * 30;

/** What happened to the canary's drops near unplug, from the lab's numbers. */
export function canaryOutcome(f: Facts): string {
  const drops = f.v.canary.after.dropsNearUnplug;
  const closed = f.v.canary.after.closedByReconciliation;
  const skipped = f.v.correctness.newerTransactionSkips;
  if (closed >= drops) return `on the canary, reconciliation closed all ${closed}`;
  const rest = drops - closed;
  const why =
    skipped === rest
      ? `${rest === 1 ? "the other had" : `the other ${rest} had`} a newer session on the charger and went to a person`
      : `${rest} went to a person`;
  return `on the canary, reconciliation closed ${closed} of ${drops}; ${why}`;
}

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
    claim: (f) => `One pattern, one incident: ${f.incident.incidentId}.`,
    lede: (f) =>
      `${f.incident.totalTickets} tickets at ${f.incident.sites.length} sites in ${-f.incident.firstSeenDay} days. It crosses the escalation line three ways: ${list(f.triggers)}.`,
    desk: "incident",
  },
  {
    id: "e2",
    stage: "evidence",
    when: day0,
    claim: (f) => `Every stuck session dropped its connection within ${window30(f.drop.max)} s of the unplug event.`,
    lede: (f) =>
      `${f.drop.n} of ${f.drop.n} sessions. The drop came ${f.drop.min} to ${f.drop.max} seconds after the charger reported losing communication with the EV (simulated here as unplugging).`,
    desk: "incident",
  },
  {
    id: "e3",
    stage: "evidence",
    when: day0,
    claim: () => "The charger sent the Ended. This synthetic backend ignored it.",
    lede: () =>
      "A known class of backend handling bug, exposed by OCPP reconnects, in a synthetic system: on FW-A the queued Ended arrived after the reconnect, and the backend dropped it as out of order because the connector already read Available.",
    desk: "incident",
  },
  {
    id: "e3b",
    stage: "evidence",
    when: day0,
    claim: () => "On FW-B, the Ended never arrived.",
    lede: () =>
      "Same drop, same reconnect, then nothing. Either the firmware lost its queue or the capture missed it; the logs alone cannot say which.",
    desk: "incident",
  },
  {
    id: "e4",
    stage: "evidence",
    when: day0,
    claim: (f) => `${ofDrops(f, 0)} drops near unplug ended stuck.`,
    lede: (f) =>
      `${ofDrops(f, 1)}. ${ofDrops(f, 2)}. Drops at other times left ${f.fleet.reduce((n, r) => n + r.stuckFromElsewhere, 0)} sessions stuck.`,
    desk: "incident",
  },
  {
    id: "e5",
    stage: "evidence",
    when: day0,
    claim: () => "Two hypotheses, neither confirmed. Support contains it today.",
    lede: (f) =>
      `They may both be true. Meanwhile the ${f.incident.openIds.length} open sessions are corrected under the incident, and a detector is proposed for new ones.`,
    desk: "incident",
  },
  {
    id: "e6",
    stage: "evidence",
    when: day0,
    claim: () => "Reproduced on demand.",
    lede: () =>
      "A small OCPP 2.0.1 backend and a simulated charger replay the sequence. With the legacy handling, the session stays open. It is a known class of reconnect bug; an open-source backend fixed a related reconnect problem in public.",
    desk: "incident",
  },
  {
    id: "v1",
    stage: "verification",
    when: day0,
    claim: () => "One packet to engineering. One ask, with the bug reproduced in a test.",
    lede: () => "A person approves it before it goes.",
    desk: "handoff",
    action: "send",
  },
  {
    id: "v2",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay}`,
    claim: (f) => `Engineering's change, behind a flag on ${f.v.canary.sites} canary sites.`,
    lede: (f) =>
      `${f.v.control.sites} control sites (${LAB.controlMix}) keep the legacy behaviour, so the control is not perfectly matched.`,
    desk: "handoff",
  },
  {
    id: "v3",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay + f.v.windowDays}`,
    claim: (f) =>
      `Canary ${f.v.canary.before.stuck} → ${f.v.canary.after.stuck}. Control ${f.v.control.before.stuck} → ${f.v.control.after.stuck}.`,
    lede: (f) =>
      `Stuck sessions in the ${f.v.windowDays} days before and after. Drops near unplug kept happening; ${canaryOutcome(f)}.`,
    desk: "handoff",
  },
  {
    id: "v4",
    stage: "verification",
    when: (f) => `Day ${f.shippedDay + f.v.windowDays}`,
    claim: () => "Consistent with the hypothesis. Not proof of it.",
    lede: (f) =>
      `Only ${f.v.correctness.reconciled} reconciliations and ${f.v.correctness.lateEndedArrived} late Ended events exercised the change.`,
    desk: "handoff",
  },
  {
    id: "c1",
    stage: "close",
    when: () => "The next ticket",
    claim: () => "Next time, support has the article.",
    lede: (f) =>
      `A new ticket is checked against it. The first step is always the meter check, before ${f.heldRunbook}.`,
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
