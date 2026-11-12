// The SaaS support incident (INC-0527, webhook endpoints paused by a token-refresh storm) in the neutral shape the
// incident screens read. All its wording lives here. The 21-day endpoint view, the per-storm timings and the detector
// snapshot are the pack's synthetic production data (shared/packs/saas-support/incident.ts); the log excerpts and
// the canary and control results are the lab's own output (src/data/experiment.saas-support.json), copied
// unchanged from lab-saas/. Synthetic: no real company, customer or identity provider.
import lab from "../data/experiment.saas-support.json";
import { SAAS_LAB } from "../data/lab.saas-support";
import { INCIDENT as I } from "../../shared/packs/saas-support/incident";
import type { Facts } from "../story/beats";
import { list } from "../story/words";
import type { Incident, IncidentLog, LogFlag, LogLine } from "./types";

const before = lab.windows.before;
const after = lab.windows.after;
const days = -I.firstSeenDay;
/** The window the endpoint view covers, the same as the repeat rule's. */
const WINDOW = 21;
const windowDays = lab.settings.days;
const n = (x: number) => x.toLocaleString("en-US");
const inFlight = I.storms.map((s) => s.inFlight);
const storms = { min: Math.min(...inFlight), max: Math.max(...inFlight), n: inFlight.length };
const [hmac, oauth] = I.breakdown as [(typeof I.breakdown)[0], (typeof I.breakdown)[0]];
const excerpts: IncidentLog[] = lab.logs.map((l) => ({ title: l.title, lines: l.lines as unknown as LogLine[] }));
/** The detector's hits on the control workspaces: every storm the control arm had in the after window. */
const detectorHits = after.control.storms;

const TRIGGER_WORDS: Record<string, string> = {
  code: "it needs a code change",
  spread: `it spans ${I.accounts.length} accounts`,
  security: "a customer's security team is involved",
  data: "customers are missing events",
};
const triggerWords = I.escalation.fired.map((k) => TRIGGER_WORDS[k]!);
const WAYS: Record<number, string> = { 2: "two", 3: "three", 4: "four" };

const FLAG_NOTE: Record<LogFlag["kind"], string> = {
  dropped: "every thread asks for its own token",
  missing: "paused while the customer's server is up",
  ignored: "rate-limited by the identity provider",
};
function logFlag(detail: string): LogFlag["kind"] | null {
  if (/429/.test(detail)) return "ignored";
  if (/endpoint paused/.test(detail)) return "missing";
  if (/each request a new token/.test(detail)) return "dropped";
  return null;
}

/** What happened on the canary, from the lab's numbers. */
function canaryOutcome(): string {
  const real = after.canary.realOutagePauses;
  const rest = after.canary.pauses - real;
  const pauses =
    rest === 0
      ? `${after.canary.pauses === 1 ? "the one pause left was" : `all ${after.canary.pauses} pauses left were`} a real endpoint outage, which should pause`
      : `${rest} pause${rest === 1 ? "" : "s"} still came from storms`;
  return `on the canary, token requests fell from ${n(before.canary.tokenRequests)} to ${n(after.canary.tokenRequests)}, and ${pauses}`;
}

const detectorRows = I.detector.endpoints.map((e) => {
  const candidate = e.tokenRequests > I.detector.threshold;
  return {
    id: e.id,
    cells: [
      { text: e.account },
      { text: String(e.tokenRequests), num: true },
      { text: e.paused ? "Paused" : "Active" },
    ],
    candidate,
    reason: candidate
      ? `${e.tokenRequests} token requests in 60 s, over the ${I.detector.threshold} the query allows`
      : `${e.tokenRequests} token request${e.tokenRequests === 1 ? "" : "s"} in 60 s`,
  };
});
const candidates = detectorRows.filter((r) => r.candidate).length;
const tokenMax = Math.max(...I.breakdown.map((b) => b.burstExpiries));

const arms = [
  { name: "Canary (fix on)", b: before.canary, a: after.canary },
  { name: "Control (fix off)", b: before.control, a: after.control },
];

export const SAAS_INCIDENT: Incident = {
  packId: "saas-support",
  id: I.id,
  name: I.name,
  openIds: I.openIds,
  historyIds: I.historyIds,
  recordOnlyRunbook: "RB-14",
  placeWord: "accounts",
  queue: {
    raisedBy:
      "Raised by support chat, customer success, account management, billing ops, security and the status monitor. Each needs an engineering-level look.",
    check: "confirms a test delivery",
  },

  patternFacts: [
    [String(I.totalTickets), "tickets", `${I.openIds.length} open, ${I.historyIds.length} closed before`],
    [String(I.accounts.length), "accounts", "no single customer or endpoint"],
    [String(days), "days", "since first seen"],
    [String(storms.n), "storms", "each at a token expiry on the hour"],
  ],
  boardFacts: [
    ["Tickets", String(I.totalTickets)],
    ["Accounts", String(I.accounts.length)],
    ["Days", String(days)],
    ["Storms", String(storms.n)],
  ],
  escalation: {
    supportOwns: I.escalation.supportOwns,
    escalateWhenAny: I.escalation.escalateWhenAny,
    fired: I.escalation.fired,
  },
  timing: {
    title: "Deliveries in flight when the token expired",
    idLabel: "Ticket",
    lede: `Every paused endpoint had ${storms.min} to ${storms.max} deliveries in flight when its token expired on the hour. An expiry with fewer than ${I.burstThreshold} in flight sent one token request. The bar runs to 40.`,
    caption: "Storms by deliveries in flight at the token expiry",
    groupLabel: "Account",
    valueLabel: "In flight",
    axisLabel: "Position on the 0 to 40 deliveries axis",
    axisMax: 40,
    ticks: [0, 10, 20, 30, 40],
    unit: "",
    rows: I.storms.map((s) => ({ id: s.id, group: s.account, value: s.inFlight })),
    plotCaption: `Deliveries in flight at the token expiry, one dot per storm that paused an endpoint (n = ${storms.n}).`,
  },
  logs: {
    title: "Delivery logs",
    lede: "Synthetic excerpts as the webhook delivery service summarised them, captured from the lab's real traffic. The customers' identity provider logs are not available to support. Flagged lines are where the storm builds and the endpoint is paused.",
    excerpts: excerpts.slice(0, 3),
    flag: (detail) => {
      const kind = logFlag(detail);
      return kind ? { kind, note: FLAG_NOTE[kind] } : null;
    },
  },
  replays: {
    excerpts,
    tone: (detail) => {
      if (/429|endpoint paused/.test(detail)) return "bad";
      if (/each request a new token|retries at once/.test(detail)) return "attn";
      return undefined;
    },
    beats: {
      e3: { ticket: "T-3004", note: "Harbor Analytics · every thread asks for its own token" },
      e3b: { ticket: "T-3024", note: "Saffron Foods · no event delivered before the pause" },
    },
    caption:
      "Synthetic delivery-service summaries, captured in the lab. The customers' identity provider logs are not available to support.",
  },
  breakdown: {
    title: `Endpoint view, last ${WINDOW} days`,
    lede: `Every endpoint, by how it checks our requests. A burst expiry is a token expiring with ${I.burstThreshold} or more deliveries in flight. HMAC endpoints use no token.`,
    caption: "Endpoints, token expiries and pauses by how the endpoint checks our requests",
    columns: [
      { label: "Endpoint auth" },
      { label: "Endpoints", num: true },
      { label: "Token expiries", num: true },
      { label: "Burst expiries that paused" },
      { label: "Pauses", num: true },
    ],
    rows: I.breakdown.map((b) => ({
      key: b.auth,
      cells: [
        { text: b.auth, mono: true },
        { text: n(b.endpoints), num: true },
        { text: n(b.tokenExpiries), num: true },
        {
          text: b.burstExpiries ? `${I.rateLimited} of ${b.burstExpiries}` : "no tokens",
          bar: b.burstExpiries ? Math.round((I.rateLimited / b.burstExpiries) * 100) : 0,
        },
        {
          text: `${b.pauses}${b.realOutages === b.pauses ? " · all real outages" : b.realOutages === 0 ? " · no real outages" : ` · ${b.realOutages} real`}`,
          num: true,
        },
      ],
    })),
  },
  bars: {
    caption: `Burst expiries and the pauses they caused, by endpoint auth, ${WINDOW} days`,
    columns: ["Endpoint auth", "Burst expiries that paused the endpoint", "Paused", "Endpoints"],
    rows: I.breakdown.map((b) => ({
      key: b.auth,
      length: (b.burstExpiries / tokenMax) * 100,
      fill: b.burstExpiries ? (I.rateLimited / b.burstExpiries) * 100 : 0,
      strong: String(b.burstExpiries ? I.rateLimited : 0),
      of: String(b.burstExpiries),
      muted: n(b.endpoints),
    })),
    figcaption: `Bar length: token expiries with ${I.burstThreshold}+ deliveries in flight. Filled: the ones that hit the rate limit and paused the endpoint. ${WINDOW} days.`,
  },
  ruledOut: I.ruledOut,
  containment: {
    title: "Containment and the detector",
    lines: I.supportNow,
    board: [
      {
        lead: `${I.heldIds.length} paused endpoints replayed`,
        rest: ` under ${I.id}: each after a test delivery answered 200, with the replayed range noted on the ticket.`,
      },
      {
        lead: "Detector proposed",
        rest: `, read-only, every 15 minutes: an OAuth endpoint with more than ${I.detector.threshold} token requests in 60 seconds becomes a candidate for a person.`,
      },
      { lead: "The tickets stay open", rest: " on the incident. None is closed as a one-off." },
    ],
    boardCaption: (held) => `Containment replays events with ${held}. It does not change why the storms happen.`,
  },
  detector: {
    title: "Detector run on a snapshot of OAuth endpoints (synthetic)",
    note: `A read-only query: no code or production config change. Proposed to run every 15 minutes; here it runs once, on a snapshot at 02:01 ET. A candidate sent more than ${I.detector.threshold} token requests in the last 60 seconds.`,
    query: I.detector.query,
    caption: "OAuth endpoints checked by the detector, with the result for each",
    idLabel: "Endpoint",
    columns: [{ label: "Account" }, { label: "Token requests, 60 s", num: true }, { label: "State" }],
    rows: detectorRows,
    summary: `${candidates} of ${detectorRows.length} endpoints are candidates. The query does not check whether the customer's server is up. A person does, with a test delivery, before RB-14.`,
  },
  change: I.change,
  verification: {
    windowDays,
    caption: `Token storms in the ${windowDays} days before and after, canary and control`,
    columns: [
      { label: "Group" },
      { label: "Endpoints", num: true },
      { label: "Storms before", num: true },
      { label: "Storms after", num: true },
      { label: "Token requests, before / after", num: true },
    ],
    rows: arms.map(({ name, b, a }) => ({
      name,
      cells: [String(a.endpoints), String(b.storms), String(a.storms), `${n(b.tokenRequests)} / ${n(a.tokenRequests)}`],
    })),
    note: `A storm is more than ${lab.settings.stormThreshold} token requests for one endpoint in one minute. On the canary, pauses went from ${before.canary.pauses} to ${after.canary.pauses}; the one left was the scripted 503 outage, which should pause. The control went from ${before.control.pauses} to ${after.control.pauses}.`,
    differences: lab.storyComparison,
    checksTitle: "Correctness on the canary endpoints",
    checks: [
      ["Events in the after window", n(after.canary.events)],
      ["Delivered twice", String(after.canary.deliveredTwice)],
      ["Lost (never delivered)", `${after.canary.lost}, from ${before.canary.lost} before`],
      ["Real outages that still paused", String(after.canary.realOutagePauses)],
      ["Revoked client still fails and counts", "yes, in DeliveryEdgeCasesTest"],
    ],
    bars: {
      groups: [
        {
          name: `Canary · ${after.canary.endpoints} endpoints · fix on`,
          tone: "ok" as const,
          b: before.canary,
          a: after.canary,
        },
        {
          name: `Control · ${after.control.endpoints} endpoints · fix off`,
          tone: "bad" as const,
          b: before.control,
          a: after.control,
        },
      ].map(({ name, tone, b, a }) => ({
        name,
        tone,
        arms: [
          { label: "Before" as const, value: b.storms, context: `${n(b.tokenRequests)} token requests` },
          { label: "After" as const, value: a.storms, context: `${n(a.tokenRequests)} token requests` },
        ],
      })),
      unit: "storms",
      caption:
        "A pause from a real endpoint outage is counted separately, not as a storm. Computed by the lab's experiment from scripted, synthetic traffic.",
    },
    held: {
      title: `Checks that held · ${n(after.canary.events)} canary events`,
      lines: [
        `${after.canary.deliveredTwice} events delivered twice`,
        `${after.canary.lost} events lost, from ${before.canary.lost} before`,
        `${after.canary.realOutagePauses} real outage still paused its endpoint`,
        "a revoked client still fails and counts toward the pause",
        `${detectorHits} detector hits on the control, each within ${I.detector.flaggedWithinMinutes} minutes of the pause`,
      ],
    },
  },
  lab: SAAS_LAB,
  handoff: {
    attachmentsNote: "the three delivery log excerpts, the endpoint table and the deliveries in flight per storm.",
    markdown: [
      `## Attached: log excerpts (synthetic delivery-service summaries, captured in the lab)\n${excerpts
        .slice(0, 3)
        .map((l) => `### ${l.title}\n\`\`\`\n${l.lines.map((x) => x.join("  ")).join("\n")}\n\`\`\``)
        .join("\n\n")}`,
      `## Attached: endpoint view, last ${WINDOW} days\n| Endpoint auth | Endpoints | Token expiries | Burst expiries | Pauses | Real outages |\n|---|---|---|---|---|---|\n${I.breakdown
        .map(
          (b) =>
            `| ${b.auth} | ${b.endpoints} | ${b.tokenExpiries} | ${b.burstExpiries} | ${b.pauses} | ${b.realOutages} |`,
        )
        .join("\n")}`,
      `## Attached: deliveries in flight per storm\n${I.storms.map((s) => `${s.id} ${s.account} ${s.expiry} ET ${s.inFlight}`).join(", ")}`,
    ],
  },
  board: {
    incidentValue: (pastHypotheses) =>
      pastHypotheses ? "2 hypotheses · not confirmed" : `${I.totalTickets} tickets · ${I.accounts.length} accounts`,
    reproValue: "token storm, on demand",
    fixValue: `flag on ${after.canary.endpoints} canary workspaces`,
    resultValue: `canary ${before.canary.storms} → ${after.canary.storms} · control ${before.control.storms} → ${after.control.storms}`,
    summary: { n: `${before.canary.storms} → ${after.canary.storms}`, text: "token storms on the canary endpoints" },
  },
  storyFacts: { storms, lab: lab.windows },
  pages: {
    monitor: {
      name: "the status monitor",
      lede: "The status monitor watches the product around the clock",
      sync: {
        title: "Status monitor sync",
        text: "Alerts and repeat offenders from the night: which accounts, which endpoints, which ones were paused before. During the day the status monitor reaches this shift directly, with an agreed time to acknowledge.",
      },
    },
    notes: {
      kicker: "Engineering notes · SaaS support",
      labStack:
        "Java 25, Spring Boot 4, PostgreSQL through Testcontainers, a webhook delivery service with a scripted identity provider and a scripted customer endpoint over HTTP.",
      labPath: "lab-saas",
      recordOnlyCheck:
        "A closure must name a real runbook and fit the ticket, and a person approves it. A record-only runbook also needs a person to confirm a test delivery first.",
      notModelled: [
        "Real customers' identity providers: the lab's is scripted, with one active token per client and a limit of 100 token requests a minute.",
        "A real delivery pool: the worker's threads are modelled in rounds, so a run repeats exactly.",
        "Webhook signing beyond two contrast cases: an HMAC endpoint and a rotated signing secret.",
        "Production traffic volumes, or anything about a real company's systems. Every account, ticket and number is synthetic.",
      ],
    },
  },
  triggerWords,
  canaryOutcome,
  beats: {
    e1: {
      claim: () => `One pattern, one incident: ${I.id}.`,
      lede: () =>
        `${I.totalTickets} tickets from ${I.accounts.length} accounts in ${days} days. It crosses the escalation line ${WAYS[triggerWords.length] ?? triggerWords.length} ways: ${list(triggerWords)}.`,
    },
    e2: {
      claim: () => "Every paused endpoint lost its token on the hour, mid-burst.",
      lede: () =>
        `${storms.n} of ${storms.n} storms began at a token expiry with ${storms.min} to ${storms.max} deliveries in flight. A quiet expiry sends one token request.`,
    },
    e3: {
      claim: () => "Every delivery asked for its own token. The customer's identity provider said stop.",
      lede: () =>
        "A known class of bug, a thundering herd, in a synthetic system: 32 deliveries met an expired token, each asked for a new one and retried at once, each new token revoked the last, and after 100 requests in a minute the answer was 429.",
    },
    e3b: {
      claim: () => "At Saffron Foods, nothing reached the server before the pause.",
      lede: () =>
        "Only token requests went out, then the endpoint was paused for repeated failures. That is why the customer's own logs showed no deliveries from us.",
    },
    e4: {
      claim: () => `${I.rateLimited} of ${oauth.burstExpiries} burst expiries paused an endpoint.`,
      lede: () =>
        `All ${oauth.pauses} OAuth pauses in ${WINDOW} days. The ${n(hmac.endpoints)} HMAC endpoints use no token, and their ${hmac.pauses} pauses were all real outages.`,
    },
    e5: {
      claim: () => "Two hypotheses, neither confirmed. Support contains it today.",
      lede: () =>
        `They may both be true. Meanwhile the ${I.heldIds.length} paused endpoints are replayed under the incident, and a detector is proposed for new storms.`,
    },
    e6: {
      claim: () => "Reproduced on demand.",
      lede: () =>
        "A small webhook delivery service, a scripted identity provider and a scripted customer endpoint replay the burst. With the legacy refresh, the endpoint is paused while it is up.",
    },
    v1: {
      claim: () => "One packet to engineering. One ask, with the storm reproduced in a test.",
      lede: () => "A person approves it before it goes.",
    },
    v2: {
      claim: () => `Engineering's change, behind a flag on ${after.canary.endpoints} canary workspaces.`,
      lede: () =>
        `${after.control.endpoints} control workspaces keep the legacy refresh. Both arms run on the lab's scripted traffic, so the result is a lab result.`,
    },
    v3: {
      claim: () =>
        `Canary ${before.canary.storms} → ${after.canary.storms}. Control ${before.control.storms} → ${after.control.storms}.`,
      lede: () =>
        `Token storms in the ${windowDays} days before and after. The bursts kept coming; ${canaryOutcome()}.`,
    },
    v4: {
      claim: () => "Consistent with the hypothesis. Not proof of it.",
      lede: () =>
        `The lab's identity provider is scripted. Real customers' identity providers may limit token requests differently.`,
    },
    c1: {
      claim: () => "Next time, support has the article.",
      lede: (f: Facts) =>
        `A new ticket is checked against it. The first step is always a test delivery, before ${f.heldRunbook}.`,
    },
  },
};
