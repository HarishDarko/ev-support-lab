// SYNTHETIC DATA. The e-commerce incident, INC-0539: orders stuck in Payment pending after checkout retries a slow
// payment. Every order, number and log line here is made up for a prototype. The 21-day channel breakdown, the
// per-order timings and the detector snapshot describe the "production" incident before the lab existed, so they
// live here. The log excerpts and the canary and control results come from the lab's experiment (lab-ecommerce/,
// copied into desk/src/data/experiment.e-commerce.json); the desk never types them in.

export const INCIDENT_ID = "INC-0539";
export const CHANGE_REF = "ENG-5230";

/** One order in the pattern: a slow first answer, then a second authorization with a new idempotency key. */
export interface SlowOrder {
  id: string;
  order: string;
  channel: string;
  /** Seconds the processor took to answer the first authorization. */
  firstAnswer: number;
  /** When the second request went out, after the 8 s timeout, and who sent it. */
  retry: string;
  outcome: string;
}

export interface EscalationRule {
  key: "code" | "spread" | "money" | "fraud";
  text: string;
}

export const INCIDENT = {
  id: INCIDENT_ID,
  name: "Orders stuck in Payment pending after checkout retries a slow payment",
  /** The open tickets on the incident: four RB-21 closures the repeat rule holds, and one linked escalation. */
  openIds: ["T-4002", "T-4006", "T-4010", "T-4018", "T-4022"],
  heldIds: ["T-4002", "T-4006", "T-4018", "T-4022"],
  historyIds: ["H-4101", "H-4104", "H-4107", "H-4113"],
  channels: ["Web", "iOS app", "Android app"],
  firstSeenDay: -20,
  totalTickets: 9,
  /** Charged twice: both authorizations captured. */
  chargedTwice: 2,
  /** Checkout's client timeout for the processor's answer, in seconds. */
  timeoutSeconds: 8,
  /** Every ticketed order in the pattern. */
  orders: [
    {
      id: "H-4101",
      order: "#47110",
      channel: "Web",
      firstAnswer: 9.4,
      retry: "21 s (customer)",
      outcome: "Held, RB-21",
    },
    { id: "H-4104", order: "#47610", channel: "iOS", firstAnswer: 8.6, retry: "0.5 s (app)", outcome: "Held, RB-21" },
    {
      id: "H-4107",
      order: "#48020",
      channel: "Android",
      firstAnswer: 11.2,
      retry: "0.5 s (app)",
      outcome: "Both captured, answers 38 ms apart",
    },
    {
      id: "H-4113",
      order: "#48601",
      channel: "Web",
      firstAnswer: 8.9,
      retry: "34 s (customer)",
      outcome: "Held, RB-21",
    },
    { id: "T-4002", order: "#51102", channel: "Web", firstAnswer: 10.1, retry: "12 s (customer)", outcome: "Held" },
    { id: "T-4006", order: "#51150", channel: "iOS", firstAnswer: 8.4, retry: "0.5 s (app)", outcome: "Held" },
    {
      id: "T-4010",
      order: "#51209",
      channel: "iOS",
      firstAnswer: 12.7,
      retry: "0.5 s (app)",
      outcome: "Both captured, answers 20 ms apart",
    },
    { id: "T-4018", order: "#51388", channel: "Android", firstAnswer: 9.8, retry: "0.5 s (app)", outcome: "Held" },
    { id: "T-4022", order: "#52388", channel: "Web", firstAnswer: 13.9, retry: "9 s (customer)", outcome: "Held" },
  ] satisfies SlowOrder[],
  /** 21 days, every checkout, by channel. */
  breakdown: [
    { channel: "Web", checkouts: 38400, slow: 19, newKey: 5, secondAuth: 5, stuck: 5, bothCaptured: 0 },
    { channel: "iOS app", checkouts: 14100, slow: 4, newKey: 4, secondAuth: 4, stuck: 3, bothCaptured: 1 },
    { channel: "Android app", checkouts: 9800, slow: 2, newKey: 2, secondAuth: 2, stuck: 1, bothCaptured: 1 },
  ],
  /** Of the 11 orders with a second authorization, the ones that reached support as tickets. */
  ticketed: 9,
  /** Delivery log excerpts as the lab captured them (the first three in its experiment output), copied unchanged. */
  logs: [
    {
      title: "T-4002: web, order #51102, paid again after the error (synthetic)",
      lines: [
        ["14:02:11.200", "checkout-web", "POST /authorizations  order=#51102  £58.00  idem_key=ck_51102_a1"],
        ["14:02:19.200", "checkout-web", 'no answer after 8.0 s -> shows "Something went wrong"'],
        ["14:02:21.300", "processor", "authorization.succeeded  au_96F9  idem_key=ck_51102_a1  (answered in 10.1 s)"],
        ["14:02:21.300", "order-svc", "#51102 captured au_96F9 £58.00"],
        ["14:02:31.200", "shopper", "taps Pay again"],
        ["14:02:31.200", "checkout-web", "POST /authorizations  order=#51102  £58.00  idem_key=ck_51102_a2"],
        ["14:02:32.700", "checkout-web", "authorized au_96FA in 1.5 s -> shows the order confirmation"],
        ["14:02:32.700", "processor", "authorization.succeeded  au_96FA  idem_key=ck_51102_a2  (answered in 1.5 s)"],
        [
          "14:02:32.700",
          "order-svc",
          "#51102 extra authorization au_96FA on a captured order -> hold: Payment pending",
        ],
      ],
    },
    {
      title: "T-4010: iOS app, order #51209, captured twice (synthetic)",
      lines: [
        ["09:15:02.000", "checkout-app", "POST /authorizations  order=#51209  £36.50  idem_key=ck_51209_a1"],
        ["09:15:10.000", "checkout-app", 'no answer after 8.0 s -> shows "Something went wrong"'],
        ["09:15:10.000", "app", "automatic retry, 500 ms after the timeout"],
        ["09:15:10.500", "checkout-app", "POST /authorizations  order=#51209  £36.50  idem_key=ck_51209_a2"],
        ["09:15:14.700", "processor", "authorization.succeeded  au_A681  idem_key=ck_51209_a1  (answered in 12.7 s)"],
        ["09:15:14.720", "checkout-app", "authorized au_A682 in 4.2 s -> shows the order confirmation"],
        ["09:15:14.720", "processor", "authorization.succeeded  au_A682  idem_key=ck_51209_a2  (answered in 4.2 s)"],
        ["09:15:14.720", "order-svc", "#51209 captured au_A682 £36.50"],
        ["09:15:14.720", "order-svc", "#51209 captured au_A681 £36.50"],
        ["09:15:14.720", "order-svc", "#51209 two captures -> hold: Payment pending"],
      ],
    },
    {
      title: "H-4109: web, order #48266, the webhook never came (synthetic)",
      lines: [
        ["11:40:03.000", "checkout-web", "POST /authorizations  order=#48266  £24.50  idem_key=ck_48266_a1"],
        ["11:40:04.400", "checkout-web", "authorized au_9FE6 in 1.4 s -> shows the order confirmation"],
        ["11:40:34.400", "order-svc", "#48266 authorization webhook not received in 30 s -> hold: Payment pending"],
      ],
    },
  ] as { title: string; lines: [time: string, actor: string, detail: string][] }[],
  ruledOut: [
    "The checkout deploy (T-4007): the 9 orders span 21 days, and none fell in the 500-error window before the rollback.",
    "The processor or the card issuer duplicating: the processor received two separate requests from our checkout, each with its own idempotency key, and did what it was asked.",
    "Customers paying twice on purpose: in 5 of the 9 the second request came from the app itself, 0.5 s after the timeout, with no tap.",
    "A delayed capture webhook (H-4109): one authorization and one key; a different cause.",
    "Fraud holds: none of the 9 orders had a fraud flag.",
  ],
  supportNow: [
    "Containment under the incident: RB-21 for each of the 4 held orders, only after the processor shows one capture; each order flagged for a payments review. The 5 tickets stay open on the incident; none is closed as a one-off. The double capture (T-4010) goes to payments engineering for a refund, not RB-21.",
    "Read-only detector query written, proposed to run every 15 min: orders in Payment pending with 2 or more authorizations from different idempotency keys within 60 s. Each hit becomes a candidate ticket for a person to review, before the customer contacts us.",
  ],
  escalation: {
    supportOwns: [
      "A runbook exists and fixes it",
      "No code or production config change needed",
      "One order or one customer",
    ],
    escalateWhenAny: [
      { key: "code", text: "Needs a code or production config change" },
      { key: "spread", text: "Same pattern on 3+ orders or channels, or recurring for 2+ weeks" },
      { key: "money", text: "A customer charged wrongly, or money held in error" },
      { key: "fraud", text: "Fraud or a security risk is suspected" },
    ] satisfies EscalationRule[],
    fired: ["code", "spread", "money"] as const,
  },
  change: {
    ref: CHANGE_REF,
    shippedDay: 5,
    summary:
      "Checkout makes the idempotency key once per checkout and reuses it on every retry, so a retry returns the first authorization; it makes a new key only when the card or the amount changes. On a timeout it asks the processor for the payment by that key before showing anything, and says the payment is still processing. The order service captures under a per-order lock, so two authorizations can never both be captured.",
    rollout:
      "Behind a per-store flag on 1 of the shop's 5 regional stores (the canary); the other 4 stores stay on the old checkout (the control). The lab's experiment runs both arms over 14 days of scripted traffic.",
  },
  detector: {
    query: "orders WHERE status = 'Payment pending' AND authorizations from 2+ idempotency keys within 60 s",
    windowSeconds: 60,
    /** A snapshot of the orders in Payment pending at 20:30 ET on a control evening, the detector's input. */
    orders: [
      { id: "#52388", channel: "Web", authorizations: 2, keys: 2, apartSeconds: 4.6 },
      { id: "#52394", channel: "Web", authorizations: 1, keys: 1, apartSeconds: null },
      { id: "#52397", channel: "iOS", authorizations: 2, keys: 2, apartSeconds: 0.4 },
      { id: "#52402", channel: "Web", authorizations: 1, keys: 1, apartSeconds: null },
      { id: "#52405", channel: "Android", authorizations: 1, keys: 1, apartSeconds: null },
      { id: "#52409", channel: "Web", authorizations: 2, keys: 2, apartSeconds: 140 },
    ],
    /** Before the detector, the median time from the stuck order to the customer's first contact. */
    medianHoursToFirstContact: 19,
    /** With the detector, the median time from the second authorization to the flag. */
    medianMinutesToFlag: 3,
  },
};
