// The EV charging incident (INC-0412, sessions stay open after a charger reconnects) in the neutral shape the
// incident screens read. All its wording lives here. Every number comes from the synthetic data (the production
// view before the lab) or the lab's experiment, as before. Synthetic.
import { ENGINEERING_CHANGE, ESCALATION_LINE, HERO } from "../data/synthetic";
import { experiment } from "../data/experiment";
import { LAB } from "../data/lab";
import { FLAT_MINUTES, RECONNECT_SECONDS, detectorRun } from "../desk/incident/detector";
import {
  DROP_WINDOW_SECONDS,
  RECORD_ONLY_RUNBOOK,
  fastestDropSec,
  logFlag,
  slowestDropSec,
  sortedTimings,
  stuckByFirmware,
  stuckShare,
} from "../desk/incident/evidence";
import type { Facts } from "../story/beats";
import { list } from "../story/words";
import type { Incident, LogFlag } from "./types";

const v = experiment.verification;
const c = v.correctness;
const days = -HERO.firstSeenDay;
const secs = HERO.unplugToDropSec.map((d) => d.s);
const drop = { min: Math.min(...secs), max: Math.max(...secs), n: secs.length };

const TRIGGER_WORDS: Record<string, string> = {
  code: "it needs a code change",
  spread: `it spans ${HERO.sites.length} sites`,
  billing: "billing is at risk",
  safety: "there is a safety concern",
};
const triggerWords = ESCALATION_LINE.heroTriggers.map((k) => TRIGGER_WORDS[k]!);

const FLAG_NOTE: Record<LogFlag["kind"], string> = {
  dropped: "connection dropped",
  missing: "no Ended received",
  ignored: "Ended ignored by the backend",
};

const ofDrops = (i: number) => {
  const row = experiment.fleet[i]!;
  return `${row.fw.split(" ")[0]}: ${row.stuck} of ${row.dropsNearUnplug}`;
};
/** Rounds the slowest drop up to the next 30 s, the unit the detector and the article use. */
const window30 = (s: number) => Math.ceil(s / 30) * 30;

/** What happened to the canary's drops near unplug, from the lab's numbers. */
function canaryOutcome(): string {
  const drops = v.canary.after.dropsNearUnplug;
  const closed = v.canary.after.closedByReconciliation;
  const skipped = c.newerTransactionSkips;
  if (closed >= drops) return `on the canary, reconciliation closed all ${closed}`;
  const rest = drops - closed;
  const why =
    skipped === rest
      ? `${rest === 1 ? "the other had" : `the other ${rest} had`} a newer session on the charger and went to a person`
      : `${rest} went to a person`;
  return `on the canary, reconciliation closed ${closed} of ${drops}; ${why}`;
}

const fleetMax = Math.max(...experiment.fleet.map((r) => r.dropsNearUnplug));
const detector = detectorRun();
const candidates = detector.sessions.filter((s) => s.candidate).length;

export const EV_INCIDENT: Incident = {
  packId: "ev-charging",
  id: HERO.incidentId,
  name: HERO.name,
  openIds: HERO.openIds,
  historyIds: HERO.historyIds,
  recordOnlyRunbook: RECORD_ONLY_RUNBOOK,
  placeWord: "sites",
  queue: {
    raisedBy:
      "Raised overnight by the NOC, customer care, field service, host accounts and billing. Each needs an engineering-level look.",
    check: "confirms the meter",
  },

  patternFacts: [
    [String(HERO.totalTickets), "tickets", `${HERO.openIds.length} open, ${HERO.historyIds.length} closed before`],
    [String(HERO.sites.length), "sites", "no single site or charger"],
    [String(days), "days", "since first seen"],
    ...stuckByFirmware().map(([fw, n]) => [String(n), fw, `of ${HERO.totalTickets} stuck sessions`] as const),
  ],
  boardFacts: [
    ["Tickets", String(HERO.totalTickets)],
    ["Sites", String(HERO.sites.length)],
    ["Days", String(days)],
    ...stuckByFirmware().map(([fw, n]) => [fw, String(n)] as const),
  ],
  escalation: {
    supportOwns: ESCALATION_LINE.supportOwns,
    escalateWhenAny: ESCALATION_LINE.escalateWhenAny,
    fired: ESCALATION_LINE.heroTriggers,
  },
  timing: {
    title: "Seconds from unplug to connection drop",
    idLabel: "Ticket",
    lede: `All ${sortedTimings().length} stuck sessions dropped between ${fastestDropSec()} and ${slowestDropSec()} seconds after the driver unplugged. The bar runs to ${DROP_WINDOW_SECONDS} s.`,
    caption: "Stuck sessions by seconds from unplug to websocket drop",
    groupLabel: "Firmware",
    valueLabel: "Seconds",
    axisLabel: `Position on the 0 to ${DROP_WINDOW_SECONDS} second axis`,
    axisMax: DROP_WINDOW_SECONDS,
    ticks: [0, 30, 60, 90],
    unit: "s",
    rows: HERO.unplugToDropSec.map((d) => ({ id: d.id, group: d.fw, value: d.s })),
    plotCaption: `Seconds from unplug to the websocket drop, one dot per stuck session (n = ${HERO.unplugToDropSec.length}).`,
  },
  logs: {
    title: "Gateway logs",
    lede: "Synthetic OCPP 2.0.1 excerpts as the backend gateway summarised them, not full payloads. Charger-side logs are not available to support. Flagged lines are where the backend dropped, or never received, the Ended.",
    excerpts: HERO.logs,
    flag: (detail) => {
      const kind = logFlag(detail);
      return kind ? { kind, note: FLAG_NOTE[kind] } : null;
    },
  },
  replays: {
    excerpts: experiment.logs,
    tone: (detail) => {
      if (/ignored/i.test(detail)) return "bad";
      if (/no TransactionEvent Ended received/i.test(detail)) return "attn";
      return undefined;
    },
    beats: {
      e3: { ticket: "T-2058", note: "FW-A · the Ended arrives late and is ignored" },
      e3b: { ticket: "T-2041", note: "FW-B · no Ended arrives" },
    },
    caption: "Synthetic OCPP 2.0.1 gateway summaries. Charger-side logs are not available to support.",
  },
  breakdown: {
    title: `Fleet view, last ${days} days`,
    lede: `A websocket drop within ${DROP_WINDOW_SECONDS} seconds of unplug, and how many of those left a session stuck. Drops at other times left none stuck.`,
    caption: "Sessions, connection drops and stuck sessions by firmware line",
    columns: [
      { label: "Firmware" },
      { label: "Sessions", num: true },
      { label: "Drops near unplug", num: true },
      { label: "Ended stuck" },
      { label: "Drops at other times", num: true },
    ],
    rows: HERO.fleet.map((row) => ({
      key: row.fw,
      cells: [
        { text: row.fw, mono: true },
        { text: row.sessions.toLocaleString("en-US"), num: true },
        { text: String(row.dropsNearUnplug), num: true },
        { text: `${row.stuck} of ${row.dropsNearUnplug}`, bar: stuckShare(row) },
        {
          text: `${row.dropsElsewhere}${row.stuckFromElsewhere === 0 ? " · none stuck" : ` · ${row.stuckFromElsewhere} stuck`}`,
          num: true,
        },
      ],
    })),
  },
  bars: {
    caption: "Drops near unplug and stuck sessions by firmware line, 21 days",
    columns: ["Firmware", "Drops near unplug that ended stuck", "Stuck", "Sessions"],
    rows: experiment.fleet.map((r) => ({
      key: r.fw,
      length: (r.dropsNearUnplug / fleetMax) * 100,
      fill: r.dropsNearUnplug ? (r.stuck / r.dropsNearUnplug) * 100 : 0,
      strong: String(r.stuck),
      of: String(r.dropsNearUnplug),
      muted: r.sessions.toLocaleString("en-US"),
    })),
    figcaption: "Bar length: drops within 90 s of unplug. Filled: the ones that left a session open. 21 days.",
  },
  ruledOut: HERO.ruledOut,
  containment: {
    title: "Containment and the detector",
    lines: HERO.supportNow,
    board: [
      {
        lead: `${HERO.openIds.length} open sessions corrected`,
        rest: ` under ${HERO.incidentId}: each closed at its own last meter value, idle fees reversed, invoice flagged for billing review.`,
      },
      {
        lead: "Detector proposed",
        rest: ", read-only, every 15 minutes: an open session with no meter change for 30 minutes and a reconnect near unplug becomes a candidate for a person.",
      },
      { lead: "The tickets stay open", rest: " on the incident. None is closed as a one-off." },
    ],
    boardCaption: (held) => `Containment corrects records with ${held}. It does not change why sessions stay open.`,
  },
  detector: {
    title: "Detector run on a snapshot of open sessions (synthetic)",
    note: `A read-only query: no code or production config change. Proposed to run every 15 minutes; here it runs once. A candidate has had no meter change for ${FLAT_MINUTES} minutes or more and reconnected within ${RECONNECT_SECONDS} seconds of the unplug.`,
    query: detector.query,
    caption: "Open sessions checked by the detector, with the result for each",
    idLabel: "Session",
    columns: [{ label: "Charger" }, { label: "No meter change", num: true }, { label: "Reconnect", num: true }],
    rows: detector.sessions.map(({ session, candidate, reason }) => ({
      id: session.id,
      cells: [
        { text: session.charger, mono: true },
        { text: `${session.flatMin} min`, num: true },
        { text: session.reconnectSec == null ? "–" : `${session.reconnectSec} s`, num: true },
      ],
      candidate,
      reason,
    })),
    summary: `${candidates} of ${detector.sessions.length} open sessions are candidates. The query does not check connector state or whether a newer transaction has started. A person does, before ${RECORD_ONLY_RUNBOOK}.`,
  },
  change: ENGINEERING_CHANGE,
  verification: {
    windowDays: v.windowDays,
    caption: `Stuck sessions in the ${v.windowDays} days before and after, canary and control`,
    columns: [
      { label: "Group" },
      { label: "Sites", num: true },
      { label: "Stuck before", num: true },
      { label: "Stuck after", num: true },
      { label: "Drops near unplug, before / after", num: true },
    ],
    rows: [
      { name: "Canary (fix on)", arm: v.canary },
      { name: "Control (fix off)", arm: v.control },
    ].map(({ name, arm }) => ({
      name,
      cells: [
        String(arm.sites),
        String(arm.before.stuck),
        String(arm.after.stuck),
        `${arm.before.dropsNearUnplug} / ${arm.after.dropsNearUnplug}`,
      ],
    })),
    note: `On the canary sites ${v.canary.after.closedByReconciliation} sessions were closed by reconciliation. Of ${c.canarySessions.toLocaleString("en-US")} sessions, only ${c.reconciled} needed reconciling and ${c.lateEndedArrived} had a late Ended event. Those few cases are what exercised the change.`,
    differences: experiment.differences,
    checksTitle: "Correctness on the canary sites",
    checks: [
      ["Closed a transaction still delivering energy", String(c.falseClosures)],
      ["Skipped because a newer transaction had started", String(c.newerTransactionSkips)],
      ["Late Ended events applied once", `${c.lateEndedApplied} of ${c.lateEndedArrived}`],
      ["Duplicate charges", String(c.duplicateCharges)],
      ["Provisional invoices reviewed / adjusted", `${c.invoicesReviewed} / ${c.invoicesAdjusted}`],
    ],
    bars: {
      groups: [
        { name: `Canary · ${v.canary.sites} sites · fix on`, tone: "ok", arm: v.canary },
        { name: `Control · ${v.control.sites} sites · fix off`, tone: "bad", arm: v.control },
      ].map(({ name, tone, arm }) => ({
        name,
        tone: tone as "ok" | "bad",
        arms: [
          { label: "Before", value: arm.before.stuck, context: `${arm.before.dropsNearUnplug} drops near unplug` },
          { label: "After", value: arm.after.stuck, context: `${arm.after.dropsNearUnplug} drops near unplug` },
        ],
      })),
      unit: "stuck",
      caption:
        "Sessions flagged for a person are counted separately, not as stuck. Computed by the lab's experiment from scripted, synthetic inputs.",
    },
    held: {
      title: `Checks that held · ${c.canarySessions.toLocaleString("en-US")} canary sessions`,
      lines: [
        `${c.falseClosures} false closures: no reconciled session had rising energy or an ongoing report`,
        `${c.duplicateCharges} duplicate charges`,
        `${c.lateEndedApplied} of ${c.lateEndedArrived} late Ended events applied once`,
        `${c.newerTransactionSkips} newer-transaction skip, left for a person`,
        `${c.invoicesReviewed} provisional invoices reviewed, ${c.invoicesAdjusted} adjusted`,
      ],
    },
  },
  lab: {
    ...LAB,
    testTask: ":lab:test",
    reproKicker: "Reproduction lab · Java 25 · OCPP 2.0.1",
    fixKicker: "The change · behind a flag per station",
    reproShows: "shows the session staying open.",
  },
  handoff: {
    attachmentsNote: "the three gateway log excerpts, the fleet table and the unplug-to-drop timings.",
    markdown: [
      `## Attached: log excerpts (synthetic OCPP 2.0.1, gateway summaries)\n${HERO.logs
        .map((l) => `### ${l.title}\n\`\`\`\n${l.lines.map((x) => x.join("  ")).join("\n")}\n\`\`\``)
        .join("\n\n")}`,
      `## Attached: fleet view, last ${days} days\n| Firmware | Sessions | Drops within 90 s of unplug | Ended stuck | Other drops |\n|---|---|---|---|---|\n${HERO.fleet
        .map((f) => `| ${f.fw} | ${f.sessions} | ${f.dropsNearUnplug} | ${f.stuck} | ${f.dropsElsewhere} |`)
        .join("\n")}`,
      `## Attached: unplug-to-drop seconds per stuck session\n${HERO.unplugToDropSec.map((g) => `${g.id} ${g.fw} ${g.s}s`).join(", ")}`,
    ],
  },
  board: {
    incidentValue: (pastHypotheses) =>
      pastHypotheses ? "2 hypotheses · not confirmed" : `${HERO.totalTickets} tickets · ${HERO.sites.length} sites`,
    reproValue: "late Ended ignored, on demand",
    fixValue: `flag on ${v.canary.sites} canary sites`,
    resultValue: `canary ${v.canary.before.stuck} → ${v.canary.after.stuck} · control ${v.control.before.stuck} → ${v.control.after.stuck}`,
    summary: { n: `${v.canary.before.stuck} → ${v.canary.after.stuck}`, text: "stuck sessions on the canary sites" },
  },
  storyFacts: { drop, fleet: experiment.fleet, v },
  triggerWords,
  canaryOutcome,
  beats: {
    e1: {
      claim: () => `One pattern, one incident: ${HERO.incidentId}.`,
      lede: () =>
        `${HERO.totalTickets} tickets at ${HERO.sites.length} sites in ${days} days. It crosses the escalation line three ways: ${list(triggerWords)}.`,
    },
    e2: {
      claim: () => `Every stuck session dropped its connection within ${window30(drop.max)} s of the unplug event.`,
      lede: () =>
        `${drop.n} of ${drop.n} sessions. The drop came ${drop.min} to ${drop.max} seconds after the charger reported losing communication with the EV (simulated here as unplugging).`,
    },
    e3: {
      claim: () => "The charger sent the Ended. This synthetic backend ignored it.",
      lede: () =>
        "A known class of backend handling bug, exposed by OCPP reconnects, in a synthetic system: on FW-A the queued Ended arrived after the reconnect, and the backend dropped it as out of order because the connector already read Available.",
    },
    e3b: {
      claim: () => "On FW-B, the Ended never arrived.",
      lede: () =>
        "Same drop, same reconnect, then nothing. Either the firmware lost its queue or the capture missed it; the logs alone cannot say which.",
    },
    e4: {
      claim: () => `${ofDrops(0)} drops near unplug ended stuck.`,
      lede: () =>
        `${ofDrops(1)}. ${ofDrops(2)}. Drops at other times left ${experiment.fleet.reduce((n, r) => n + r.stuckFromElsewhere, 0)} sessions stuck.`,
    },
    e5: {
      claim: () => "Two hypotheses, neither confirmed. Support contains it today.",
      lede: () =>
        `They may both be true. Meanwhile the ${HERO.openIds.length} open sessions are corrected under the incident, and a detector is proposed for new ones.`,
    },
    e6: {
      claim: () => "Reproduced on demand.",
      lede: () =>
        "A small OCPP 2.0.1 backend and a simulated charger replay the sequence. With the legacy handling, the session stays open. It is a known class of reconnect bug; an open-source backend fixed a related reconnect problem in public.",
    },
    v1: {
      claim: () => "One packet to engineering. One ask, with the bug reproduced in a test.",
      lede: () => "A person approves it before it goes.",
    },
    v2: {
      claim: () => `Engineering's change, behind a flag on ${v.canary.sites} canary sites.`,
      lede: () =>
        `${v.control.sites} control sites (${LAB.controlMix}) keep the legacy behaviour, so the control is not perfectly matched.`,
    },
    v3: {
      claim: () =>
        `Canary ${v.canary.before.stuck} → ${v.canary.after.stuck}. Control ${v.control.before.stuck} → ${v.control.after.stuck}.`,
      lede: () =>
        `Stuck sessions in the ${v.windowDays} days before and after. Drops near unplug kept happening; ${canaryOutcome()}.`,
    },
    v4: {
      claim: () => "Consistent with the hypothesis. Not proof of it.",
      lede: () =>
        `Only ${c.reconciled} reconciliations and ${c.lateEndedArrived} late Ended events exercised the change.`,
    },
    c1: {
      claim: () => "Next time, support has the article.",
      lede: (f: Facts) =>
        `A new ticket is checked against it. The first step is always the meter check, before ${f.heldRunbook}.`,
    },
  },
};
