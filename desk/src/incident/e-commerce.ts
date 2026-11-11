// The e-commerce incident (INC-0539, orders stuck in Payment pending after checkout retries a slow payment) in the
// neutral shape the incident screens read. All its wording lives here. The 21-day channel view, the per-order
// timings and the detector snapshot are the pack's synthetic production data (shared/packs/e-commerce/incident.ts);
// the log excerpts and the canary and control results are the lab's own output (src/data/experiment.e-commerce.json),
// copied unchanged from lab-ecommerce/. Synthetic: no real shop, customer, card or payment processor.
import lab from "../data/experiment.e-commerce.json";
import { SHOP_LAB } from "../data/lab.e-commerce";
import { INCIDENT as I } from "../../shared/packs/e-commerce/incident";
import type { Facts } from "../story/beats";
import { list } from "../story/words";
import type { Incident, IncidentLog, LogFlag, LogLine } from "./types";

const before = lab.windows.before;
const after = lab.windows.after;
const days = -I.firstSeenDay;
/** The window the channel view covers, the same as the repeat rule's. */
const WINDOW = 21;
const windowDays = lab.settings.days;
const n = (x: number) => x.toLocaleString("en-US");
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const answers = I.orders.map((o) => o.firstAnswer);
const orders = { min: Math.min(...answers), max: Math.max(...answers), n: answers.length };
const total = I.breakdown.reduce(
  (s, b) => ({ slow: s.slow + b.slow, secondAuth: s.secondAuth + b.secondAuth, stuck: s.stuck + b.stuck }),
  { slow: 0, secondAuth: 0, stuck: 0 },
);
const web = I.breakdown.find((b) => b.channel === "Web")!;
const excerpts: IncidentLog[] = lab.logs.map((l) => ({ title: l.title, lines: l.lines as unknown as LogLine[] }));
/** Milliseconds between the processor's two answers in the lab's captured double charge (T-4010). */
const race = (() => {
  const log = excerpts.find((l) => l.title.startsWith("T-4010:"))!;
  const at = log.lines
    .filter((x) => x[2].startsWith("authorization.succeeded"))
    .map((x) => {
      const [h, m, s] = x[0].split(":").map(Number) as [number, number, number];
      return (h * 3600 + m * 60 + s) * 1000;
    });
  return Math.round(Math.max(...at) - Math.min(...at));
})();
const appRetrySeconds = lab.settings.appRetryMillis / 1000;

const TRIGGER_WORDS: Record<string, string> = {
  code: "it needs a code change",
  spread: `it spans ${I.channels.length} channels over ${days} days`,
  money: `${I.chargedTwice === 2 ? "two" : I.chargedTwice} customers were charged twice`,
  fraud: "fraud is suspected",
};
const triggerWords = I.escalation.fired.map((k) => TRIGGER_WORDS[k]!);
const WAYS: Record<number, string> = { 2: "two", 3: "three", 4: "four" };

const FLAG_NOTE: Record<LogFlag["kind"], string> = {
  dropped: "the retry gets a new idempotency key",
  missing: "the order is held in Payment pending",
  ignored: "the answer comes after the 8 s timeout",
};
function logFlag(detail: string): LogFlag["kind"] | null {
  if (/hold: Payment pending/.test(detail)) return "missing";
  if (/^POST \/authorizations .*idem_key=ck_\d+_a[2-9]/.test(detail)) return "dropped";
  if (/^no answer after/.test(detail)) return "ignored";
  return null;
}

/** What happened on the canary, from the lab's numbers. */
function canaryOutcome(): string {
  const slow = after.canary.slowFirstAnswer;
  const left = after.canary.secondAuthorization;
  return left === 0
    ? `on the canary, all ${slow} slow checkouts confirmed with one authorization, and checkout looked each one up by key (${after.canary.lookups} lookups)`
    : `on the canary, ${left} of ${slow} slow checkouts still made a second authorization`;
}

const detectorRows = I.detector.orders.map((o) => {
  const candidate = o.keys >= 2 && o.apartSeconds !== null && o.apartSeconds <= I.detector.windowSeconds;
  return {
    id: o.id,
    cells: [{ text: o.channel }, { text: String(o.authorizations), num: true }, { text: String(o.keys), num: true }],
    candidate,
    reason: candidate
      ? `${o.authorizations} authorizations from ${o.keys} keys, ${o.apartSeconds} s apart`
      : o.keys < 2
        ? `${o.authorizations} authorization${o.authorizations === 1 ? "" : "s"} from one key`
        : `${o.keys} keys, but ${o.apartSeconds} s apart, outside the ${I.detector.windowSeconds} s the query allows`,
  };
});
const candidates = detectorRows.filter((r) => r.candidate).length;
const slowMax = Math.max(...I.breakdown.map((b) => b.slow));

const arms = [
  { name: "Canary (fix on)", b: before.canary, a: after.canary },
  { name: "Control (fix off)", b: before.control, a: after.control },
];

export const SHOP_INCIDENT: Incident = {
  packId: "e-commerce",
  id: I.id,
  name: I.name,
  openIds: I.openIds,
  historyIds: I.historyIds,
  recordOnlyRunbook: "RB-21",
  placeWord: "orders",
  queue: {
    raisedBy:
      "Raised by customer care, payments ops, the warehouse, fraud, marketplace ops and the site monitor. Each needs an engineering-level look.",
    check: "confirms one capture at the processor",
  },

  patternFacts: [
    [String(I.totalTickets), "tickets", `${I.openIds.length} open, ${I.historyIds.length} closed before`],
    [String(I.channels.length), "channels", "web, iOS app and Android app"],
    [String(days), "days", "since first seen"],
    [String(I.chargedTwice), "charged twice", "both authorizations captured"],
  ],
  boardFacts: [
    ["Tickets", String(I.totalTickets)],
    ["Channels", String(I.channels.length)],
    ["Days", String(days)],
    ["Charged twice", String(I.chargedTwice)],
  ],
  escalation: {
    supportOwns: I.escalation.supportOwns,
    escalateWhenAny: I.escalation.escalateWhenAny,
    fired: I.escalation.fired,
  },
  timing: {
    title: "How long the processor's first answer took",
    idLabel: "Ticket",
    lede: `Every affected order's first payment answer took ${orders.min} to ${orders.max} s, longer than checkout's ${I.timeoutSeconds} s timeout. No order answered within ${I.timeoutSeconds} s was affected. The bar runs to 16 s.`,
    caption: "Orders by how long the processor's first answer took",
    groupLabel: "Channel",
    valueLabel: "First answer",
    axisLabel: "Position on the 0 to 16 seconds axis",
    axisMax: 16,
    ticks: [0, 4, 8, 12, 16],
    unit: "s",
    rows: I.orders.map((o) => ({ id: o.id, group: o.channel, value: o.firstAnswer })),
    plotCaption: `Seconds to the processor's first answer, one dot per ticketed order (n = ${orders.n}). Checkout gives up at ${I.timeoutSeconds} s.`,
  },
  logs: {
    title: "Checkout and order logs",
    lede: "Synthetic excerpts as checkout, the processor's webhooks and the order service recorded them, captured from the lab's real traffic. The processor's own internals are not available to support. Flagged lines are where the second authorization starts and the order is held.",
    excerpts: excerpts.slice(0, 3),
    flag: (detail) => {
      const kind = logFlag(detail);
      return kind ? { kind, note: FLAG_NOTE[kind] } : null;
    },
  },
  replays: {
    excerpts,
    tone: (detail) => {
      if (/hold: Payment pending/.test(detail)) return "bad";
      if (/idem_key=ck_\d+_a[2-9]|taps Pay again|automatic retry/.test(detail)) return "attn";
      return undefined;
    },
    beats: {
      e3: { ticket: "T-4002", note: "Order #51102 · the retry gets a new idempotency key" },
      e3b: { ticket: "T-4010", note: "Order #51209 · both authorizations captured" },
    },
    caption:
      "Synthetic checkout, processor and order-service lines, captured in the lab. The processor's own internals are not available to support.",
  },
  breakdown: {
    title: `Channel view, last ${WINDOW} days`,
    lede: `Every checkout, by channel. A slow first answer is one that came after checkout's ${I.timeoutSeconds} s timeout. Only a retry with a new idempotency key made a second authorization.`,
    caption: "Checkouts, slow first answers and second authorizations by channel",
    columns: [
      { label: "Channel" },
      { label: "Checkouts", num: true },
      { label: `First answer after ${I.timeoutSeconds} s`, num: true },
      { label: "Slow answers that became a second authorization" },
      { label: "Stuck · captured twice", num: true },
    ],
    rows: I.breakdown.map((b) => ({
      key: b.channel,
      cells: [
        { text: b.channel, mono: true },
        { text: n(b.checkouts), num: true },
        { text: String(b.slow), num: true },
        { text: `${b.secondAuth} of ${b.slow}`, bar: Math.round((b.secondAuth / b.slow) * 100) },
        { text: `${b.stuck} · ${b.bothCaptured}`, num: true },
      ],
    })),
  },
  bars: {
    caption: `Slow first answers and the second authorizations they caused, by channel, ${WINDOW} days`,
    columns: ["Channel", "Slow first answers that became a second authorization", "Retried", "Checkouts"],
    rows: I.breakdown.map((b) => ({
      key: b.channel,
      length: (b.slow / slowMax) * 100,
      fill: (b.secondAuth / b.slow) * 100,
      strong: String(b.secondAuth),
      of: String(b.slow),
      muted: n(b.checkouts),
    })),
    figcaption: `Bar length: first answers after ${I.timeoutSeconds} s. Filled: the ones retried with a new key, which made a second authorization. ${WINDOW} days.`,
  },
  ruledOut: I.ruledOut,
  containment: {
    title: "Containment and the detector",
    lines: I.supportNow,
    board: [
      {
        lead: `${I.heldIds.length} held orders released`,
        rest: ` under ${I.id}: each only after the processor showed one capture, with the order flagged for a payments review.`,
      },
      {
        lead: "Detector proposed",
        rest: `, read-only, every 15 minutes: an order in Payment pending with authorizations from 2 or more keys within ${I.detector.windowSeconds} seconds becomes a candidate for a person.`,
      },
      { lead: "The tickets stay open", rest: " on the incident. The double capture goes to payments, not RB-21." },
    ],
    boardCaption: (held) =>
      `Containment releases holds with ${held}. It does not change why the second authorizations happen.`,
  },
  detector: {
    title: "Detector run on a snapshot of held orders (synthetic)",
    note: `A read-only query: no code or production config change. Proposed to run every 15 minutes; here it runs once, on the orders in Payment pending at 20:30 ET. A candidate has authorizations from 2 or more idempotency keys within ${I.detector.windowSeconds} seconds.`,
    query: I.detector.query,
    caption: "Orders in Payment pending checked by the detector, with the result for each",
    idLabel: "Order",
    columns: [{ label: "Channel" }, { label: "Authorizations", num: true }, { label: "Keys", num: true }],
    rows: detectorRows,
    summary: `${candidates} of ${detectorRows.length} held orders are candidates. The query does not check how many captures an order has. A person does, at the processor, before RB-21.`,
  },
  change: I.change,
  verification: {
    windowDays,
    caption: `Second authorizations in the ${windowDays} days before and after, canary and control`,
    columns: [
      { label: "Group" },
      { label: "Stores", num: true },
      { label: "Second authorizations before", num: true },
      { label: "Second authorizations after", num: true },
      { label: "Stuck orders, before / after", num: true },
    ],
    rows: arms.map(({ name, b, a }) => ({
      name,
      cells: [
        String(a.stores),
        String(b.secondAuthorization),
        String(a.secondAuthorization),
        `${b.stuck} / ${a.stuck}`,
      ],
    })),
    note: `A second authorization is a retry with a new idempotency key that the processor authorized again. On the canary, first answers after ${lab.settings.checkoutTimeoutSeconds} s went from ${before.canary.slowFirstAnswer} to ${after.canary.slowFirstAnswer}, and none made a second authorization. The control captured one order twice in each window, ${pounds(after.control.doubleChargedPence)} each time.`,
    differences: lab.storyComparison.filter((c) => !c.matches),
    checksTitle: "Correctness on the canary store",
    checks: [
      ["Checkouts in the after window", n(after.canary.checkouts)],
      ["Captured twice", String(after.canary.bothCaptured)],
      ["Slow checkouts looked up by key", `${after.canary.lookups} of ${after.canary.slowFirstAnswer}`],
      ["New card after a decline, one authorization", String(after.canary.newCardAfterDecline)],
      ["A webhook that never came is still held", "yes, in CheckoutEdgeCasesTest"],
    ],
    bars: {
      groups: [
        {
          name: `Canary · ${after.canary.stores} store · fix on`,
          tone: "ok" as const,
          b: before.canary,
          a: after.canary,
        },
        {
          name: `Control · ${after.control.stores} stores · fix off`,
          tone: "bad" as const,
          b: before.control,
          a: after.control,
        },
      ].map(({ name, tone, b, a }) => ({
        name,
        tone,
        arms: [
          {
            label: "Before" as const,
            value: b.secondAuthorization,
            context: `${b.slowFirstAnswer} slow first answers`,
          },
          { label: "After" as const, value: a.secondAuthorization, context: `${a.slowFirstAnswer} slow first answers` },
        ],
      })),
      unit: "second authorizations",
      caption:
        "An order held for another reason (a webhook that never came) is counted separately. Computed by the lab's experiment from scripted, synthetic traffic.",
    },
    held: {
      title: `Checks that held · ${n(after.canary.checkouts)} canary checkouts`,
      lines: [
        `${after.canary.bothCaptured} orders captured twice`,
        `${after.canary.lookups} of ${after.canary.slowFirstAnswer} slow checkouts looked up by key before any error`,
        `${after.canary.newCardAfterDecline} new cards after a decline got a new key and one authorization`,
        "a webhook that never came is still held",
        `${after.control.detectorHits} detector hits on the control, ${after.canary.detectorHits} on the canary`,
      ],
    },
  },
  lab: SHOP_LAB,
  handoff: {
    attachmentsNote: "the three log excerpts, the channel table and the first-answer times for the 9 orders.",
    markdown: [
      `## Attached: log excerpts (synthetic checkout, processor and order-service lines, captured in the lab)\n${excerpts
        .slice(0, 3)
        .map((l) => `### ${l.title}\n\`\`\`\n${l.lines.map((x) => x.join("  ")).join("\n")}\n\`\`\``)
        .join("\n\n")}`,
      `## Attached: channel view, last ${WINDOW} days\n| Channel | Checkouts | First answer after ${I.timeoutSeconds} s | Retried with a new key | Second authorization | Stuck | Both captured |\n|---|---|---|---|---|---|---|\n${I.breakdown
        .map(
          (b) =>
            `| ${b.channel} | ${b.checkouts} | ${b.slow} | ${b.newKey} | ${b.secondAuth} | ${b.stuck} | ${b.bothCaptured} |`,
        )
        .join("\n")}`,
      `## Attached: first-answer times per order\n${I.orders.map((o) => `${o.id} ${o.order} ${o.channel} ${o.firstAnswer} s`).join(", ")}`,
    ],
  },
  board: {
    incidentValue: (pastHypotheses) =>
      pastHypotheses ? "2 hypotheses · not confirmed" : `${I.totalTickets} tickets · ${I.channels.length} channels`,
    reproValue: "second authorization, on demand",
    fixValue: `flag on ${after.canary.stores} canary store`,
    resultValue: `canary ${before.canary.secondAuthorization} → ${after.canary.secondAuthorization} · control ${before.control.secondAuthorization} → ${after.control.secondAuthorization}`,
    summary: {
      n: `${before.canary.secondAuthorization} → ${after.canary.secondAuthorization}`,
      text: "second authorizations on the canary store",
    },
  },
  storyFacts: { orders, race, lab: lab.windows },
  pages: {
    monitor: {
      name: "the site monitor",
      lede: "The site monitor watches checkout around the clock",
      sync: {
        title: "Site monitor sync",
        text: "Alerts and repeat offenders from the night: which orders, which channels, which payments were held before. During the day the site monitor reaches this shift directly, with an agreed time to acknowledge.",
      },
    },
    notes: {
      kicker: "Engineering notes · E-commerce",
      labStack:
        "Java 25, Spring Boot 4, PostgreSQL through Testcontainers, a checkout and order service with a scripted payment processor over HTTP and scripted shoppers.",
      labPath: "lab-ecommerce",
      recordOnlyCheck:
        "A closure must name a real runbook and fit the ticket, and a person approves it. A record-only runbook also needs a person to confirm the processor shows one capture first.",
      notModelled: [
        "A real payment processor: the lab's answers at scripted times, honours Idempotency-Key, and sends its webhooks on a scripted clock.",
        "Card networks, 3-D Secure, refunds and chargebacks.",
        "Other retry paths, such as saved carts or a second checkout service.",
        "Production traffic volumes, or anything about a real company's systems. Every store, order and number is synthetic.",
      ],
    },
  },
  triggerWords,
  canaryOutcome,
  beats: {
    e1: {
      claim: () => `One pattern, one incident: ${I.id}.`,
      lede: () =>
        `${I.totalTickets} tickets on ${I.totalTickets} orders from ${I.channels.length} channels in ${days} days. It crosses the escalation line ${WAYS[triggerWords.length] ?? triggerWords.length} ways: ${list(triggerWords)}.`,
    },
    e2: {
      claim: () => `Every stuck order's first payment answer came after the ${I.timeoutSeconds} s timeout.`,
      lede: () =>
        `${orders.n} of ${orders.n} orders: the processor took ${orders.min} to ${orders.max} s to answer. No order answered within ${I.timeoutSeconds} s was affected.`,
    },
    e3: {
      claim: () => "The retry asked for a new payment, not the same one.",
      lede: () =>
        "A known class of bug, a retry that is not idempotent, in a synthetic system: checkout gave up at 8 s, the customer paid again with a new idempotency key, and the processor made a second authorization on an order that was already captured.",
    },
    e3b: {
      claim: () => "In the app, the retry raced the first answer, and both were captured.",
      lede: () =>
        `The app retried by itself ${appRetrySeconds} s after the timeout. Both answers arrived ${race} ms apart, two workers each saw no capture yet, and the customer was charged twice.`,
    },
    e4: {
      claim: () => `${total.secondAuth} of ${total.slow} slow first answers became a second authorization.`,
      lede: () =>
        `All ${total.secondAuth} in ${WINDOW} days. On the web, ${web.slow - web.newKey} of ${web.slow} customers waited and their order confirmed; the apps retry every time, and both double charges are app orders.`,
    },
    e5: {
      claim: () => "Two hypotheses, neither confirmed. Support contains it today.",
      lede: () =>
        `They may both be true. Meanwhile the ${I.heldIds.length} held orders are released under the incident once one capture is confirmed, and a detector is proposed for new cases.`,
    },
    e6: {
      claim: () => "Reproduced on demand.",
      lede: () =>
        "A small checkout and order service, a scripted payment processor and scripted shoppers replay the slow answer. With a new key for each attempt, the order is held with two authorizations.",
    },
    v1: {
      claim: () => "One packet to engineering. One ask, with the second authorization reproduced in a test.",
      lede: () => "A person approves it before it goes.",
    },
    v2: {
      claim: () => `Engineering's change, behind a flag on ${after.canary.stores} canary store.`,
      lede: () =>
        `${after.control.stores} control stores keep the old checkout. Both arms run on the lab's scripted traffic, so the result is a lab result.`,
    },
    v3: {
      claim: () =>
        `Canary ${before.canary.secondAuthorization} → ${after.canary.secondAuthorization}. Control ${before.control.secondAuthorization} → ${after.control.secondAuthorization}.`,
      lede: () =>
        `Second authorizations in the ${windowDays} days before and after. Slow answers kept coming; ${canaryOutcome()}.`,
    },
    v4: {
      claim: () => "Consistent with the hypothesis. Not proof of it.",
      lede: () => "The lab's payment processor is scripted. The real processor may answer late more or less often.",
    },
    c1: {
      claim: () => "Next time, support has the article.",
      lede: (f: Facts) =>
        `A new ticket is checked against it. The first step is always a capture check at the processor, before ${f.heldRunbook}.`,
    },
  },
};
