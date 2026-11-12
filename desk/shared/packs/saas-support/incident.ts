// SYNTHETIC DATA. The SaaS support incident, INC-0527: webhook endpoints paused by a token-refresh storm. Every
// account, number and log line here is made up for a prototype. The 21-day breakdown, the per-storm timings and the
// detector snapshot describe the "production" incident before the lab existed, so they live here. The log excerpts
// and the canary and control results come from the lab's experiment (lab-saas/, copied into
// desk/src/data/experiment.saas-support.json); the desk never types them in.

export const INCIDENT_ID = "INC-0527";
export const CHANGE_REF = "ENG-5108";

/** One storm in the pattern: a token expiry during the hourly burst that ended with the endpoint paused. */
export interface Storm {
  id: string;
  account: string;
  when: string;
  /** The token expiry, ET. */
  expiry: string;
  /** Deliveries in flight when the token expired. */
  inFlight: number;
}

export interface EscalationRule {
  key: "code" | "spread" | "security" | "data";
  text: string;
}

export const INCIDENT = {
  id: INCIDENT_ID,
  name: "Webhook endpoints paused by a token-refresh storm",
  /** The open tickets on the incident: three RB-14 closures the repeat rule holds, two linked escalations. */
  openIds: ["T-3004", "T-3022", "T-3023", "T-3024", "T-3025"],
  heldIds: ["T-3004", "T-3023", "T-3024"],
  historyIds: ["H-3101", "H-3104"],
  accounts: ["Copperline", "Harbor Analytics", "Lumen Health", "Riverstone Legal", "Saffron Foods"],
  firstSeenDay: -20,
  totalTickets: 7,
  /** Every storm in the pattern. Below this many deliveries in flight, an expiry sent one token request. */
  burstThreshold: 20,
  storms: [
    { id: "H-3101", account: "Copperline", when: "day -20", expiry: "03:00", inFlight: 28 },
    { id: "H-3104", account: "Harbor Analytics", when: "day -15", expiry: "02:00", inFlight: 31 },
    { id: "T-3004", account: "Harbor Analytics", when: "Sun night", expiry: "01:00", inFlight: 32 },
    { id: "T-3022", account: "Lumen Health", when: "Mon night", expiry: "02:00", inFlight: 32 },
    { id: "T-3023", account: "Riverstone Legal", when: "Mon night", expiry: "03:00", inFlight: 26 },
    { id: "T-3024", account: "Saffron Foods", when: "Mon night", expiry: "04:00", inFlight: 30 },
  ] satisfies Storm[],
  /** 21 days, every endpoint, by how the endpoint checks our requests. */
  breakdown: [
    { auth: "HMAC signature", endpoints: 2880, tokenExpiries: 0, burstExpiries: 0, pauses: 6, realOutages: 6 },
    {
      auth: "OAuth client credentials",
      endpoints: 160,
      tokenExpiries: 80640,
      burstExpiries: 212,
      pauses: 19,
      realOutages: 0,
    },
  ],
  /** Of the burst expiries, the ones that hit the customer's rate limit (each paused its endpoint). */
  rateLimited: 19,
  /** OAuth endpoints those pauses were on, and the pauses that reached support as tickets. */
  pausedEndpoints: 14,
  ticketed: 5,
  /** Delivery log excerpts as the lab captured them (the first three in its experiment output), copied unchanged. */
  logs: [
    {
      title: "Harbor Analytics · ep_harbor_main · T-3004",
      lines: [
        ["01:00:00", "recurring-jobs", "burst: 32 task events on the hour"],
        ["01:00:00", "token-cache", "access token expired (lifetime 3600 s); the cache does not check"],
        ["01:00:00", "webhook-worker", "32 deliveries in flight -> 401 Unauthorized (token expired)"],
        ["01:00:00", "webhook-worker", "32 threads each request a new token (no shared refresh)"],
        ["01:00:00", "webhook-worker", "31 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["01:00:00", "webhook-worker", "31 threads each request a new token (no shared refresh)"],
        ["01:00:00", "webhook-worker", "30 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["01:00:00", "webhook-worker", "30 threads each request a new token (no shared refresh)"],
        ["01:00:00", "webhook-worker", "29 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["01:00:00", "webhook-worker", "29 threads each request a new token (no shared refresh)"],
        ["01:00:00", "customer-idp", "POST /oauth/token -> 429 Too Many Requests"],
        ["01:00:00", "endpoint-health", "endpoint paused (15 failures in 60 min)"],
        ["01:00:00", "notifier", '"Webhook endpoint paused" email to workspace admins'],
        ["01:00:00", "webhook-worker", "6 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["01:00:00", "webhook-worker", "122 token requests for 32 deliveries"],
        ["08:30:00", "support-tool", "test delivery -> 200"],
        ["08:30:00", "support-tool", "RB-14: replayed 42 failed events, 42 delivered"],
      ],
    },
    {
      title: "Saffron Foods · ep_saffron · T-3024",
      lines: [
        ["04:00:00", "recurring-jobs", "burst: 30 task events on the hour"],
        ["04:00:00", "token-cache", "access token expired (lifetime 3600 s); the cache does not check"],
        ["04:00:00", "webhook-worker", "30 deliveries in flight -> 401 Unauthorized (token expired)"],
        ["04:00:00", "webhook-worker", "30 threads each request a new token (no shared refresh)"],
        ["04:00:00", "webhook-worker", "29 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["04:00:00", "webhook-worker", "29 threads each request a new token (no shared refresh)"],
        ["04:00:00", "webhook-worker", "28 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["04:00:00", "webhook-worker", "28 threads each request a new token (no shared refresh)"],
        ["04:00:00", "webhook-worker", "27 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["04:00:00", "webhook-worker", "27 threads each request a new token (no shared refresh)"],
        ["04:00:00", "customer-idp", "POST /oauth/token -> 429 Too Many Requests"],
        ["04:00:00", "webhook-worker", "12 retries at once, 0 ms backoff -> 401 (token revoked by a newer one)"],
        ["04:00:00", "endpoint-health", "endpoint paused (15 failures in 60 min)"],
        ["04:00:00", "notifier", '"Webhook endpoint paused" email to workspace admins'],
        ["04:00:00", "webhook-worker", "114 token requests for 30 deliveries"],
        ["08:30:00", "support-tool", "test delivery -> 200"],
        ["08:30:00", "support-tool", "RB-14: replayed 34 failed events, 34 delivered"],
      ],
    },
    {
      title: "Northwind Labs · ep_northwind · H-3111",
      lines: [["14:00:00", "webhook-worker", "2 deliveries (HMAC signature, no token) -> HTTP 401"]],
    },
  ] as { title: string; lines: [time: string, actor: string, detail: string][] }[],
  ruledOut: [
    "An outage of the customer's identity provider: it answered the first 100 token requests in each minute, then 429. That is its rate limit working.",
    "A compromised client (T-3022's question): every token request came from our worker addresses with the right client id, at token expiry.",
    "Customer endpoints down: no delivery reached them during the storms (T-3024's own server logs), and they answer test deliveries.",
    "Our platform: the latency alert (T-3005) and the sign-in 503s (T-3020) do not overlap any storm.",
    "A rotated signing secret: H-3111 is an HMAC endpoint with no tokens involved, in the daytime.",
  ],
  supportNow: [
    "Containment under the incident: the 3 paused endpoints replayed with RB-14 after a test delivery answered 200. The 5 tickets stay open on the incident; none is closed as a one-off. T-3022 answered: the token requests were ours, not a compromise.",
    "Read-only detector query written, proposed to run every 15 min: an OAuth endpoint with more than 20 token requests in 60 seconds. Each hit becomes a candidate ticket for a person to review, before the customer emails.",
  ],
  escalation: {
    supportOwns: [
      "A runbook exists and fixes it",
      "No code or production config change needed",
      "One account or one endpoint",
    ],
    escalateWhenAny: [
      { key: "code", text: "Needs a code or production config change" },
      { key: "spread", text: "Same pattern on 3+ accounts, or recurring for 2+ weeks" },
      { key: "security", text: "A customer's security team is involved" },
      { key: "data", text: "Customer data missing or delivered wrong" },
    ] satisfies EscalationRule[],
    fired: ["code", "spread", "security", "data"] as const,
  },
  change: {
    ref: CHANGE_REF,
    shippedDay: 5,
    summary:
      "The webhook worker refreshes an endpoint's token once, for every delivery thread: the others wait for that refresh and use its token. It refreshes 5 minutes before expiry, minus a fixed per-endpoint jitter of up to 60 seconds, so the refresh does not land on the hourly burst. After a 401 a delivery retries once, after the shared refresh. A 429 from the customer's token endpoint makes deliveries wait for Retry-After instead of failing, so it does not count toward the pause. A revoked client and HTTP errors from the endpoint still count.",
    rollout:
      "Behind a per-workspace flag on 10 canary workspaces with OAuth endpoints; 10 control workspaces stay on the old behaviour. The lab's experiment runs both arms over 14 days of scripted traffic.",
  },
  detector: {
    query: "oauth endpoints WHERE token_requests_last_60s > 20",
    threshold: 20,
    /** A snapshot of OAuth endpoints at 02:01 ET on a control night, the detector's input. */
    endpoints: [
      { id: "ep_lumen_tasks", account: "Lumen Health", tokenRequests: 118, paused: true },
      { id: "ep_kestrel", account: "Kestrel Media", tokenRequests: 1, paused: false },
      { id: "ep_granite_bi", account: "Granite Partners", tokenRequests: 24, paused: false },
      { id: "ep_quill", account: "Quill & Co", tokenRequests: 0, paused: false },
      { id: "ep_oak_erp", account: "Oak & Pine", tokenRequests: 2, paused: false },
      { id: "ep_atlas_ops", account: "Atlas Robotics", tokenRequests: 19, paused: false },
    ],
    /** On the control workspaces in the 14 days after: hits, and how soon after a pause each was flagged. */
    hits: 9,
    flaggedWithinMinutes: 15,
    /** Before the detector, the median time from a pause to the first ticket about it. */
    medianHoursPauseToTicket: 6.5,
  },
};
