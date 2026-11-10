// SYNTHETIC DATA. Every workspace, ticket and number below is made up for a prototype. None of it describes a real
// company, product, customer or person.
// SaaS support pack: the internal support desk of a made-up B2B project-management product.
import type { PackRunbook } from "../types";

export interface SaasTicket {
  id: string;
  /** Opened time, ET, e.g. "Mon 09:12". */
  opened: string;
  from: string;
  account: string;
  plan: string;
  text: string;
  /** Not used by this pack; the engine reads it for runbook exceptions. */
  fw?: string;
}

export interface SaasHistoryItem {
  id: string;
  /** Days back from today (0). */
  day: number;
  account: string;
  fw: string;
  text: string;
  resolution: string;
}

export const COMPONENTS = [
  "login-access",
  "billing",
  "bug",
  "performance",
  "integration",
  "data-request",
  "request-or-question",
] as const;
export type Component = (typeof COMPONENTS)[number];

export const RUNBOOKS: PackRunbook[] = [
  {
    id: "RB-11",
    title: "Give a workspace admin a temporary SSO bypass",
    scope:
      "Whole workspace locked out after an identity provider change; requester confirmed as an existing workspace admin by a call to a number on file, and the identity provider error is in the auth logs",
  },
  {
    id: "RB-12",
    title: "Reset two-factor after an out-of-band identity check",
    scope:
      "One user lost their authenticator; identity confirmed by a live call and approved by another workspace admin",
  },
  {
    id: "RB-13",
    title: "Refund a duplicate charge on one invoice",
    scope: "Two captures for the same invoice in the payment processor",
  },
  {
    id: "RB-14",
    title: "Replay failed webhook deliveries",
    scope:
      "Customer endpoint was down for a bounded window and now answers 2xx to a test delivery; events are marked delivered only on a 2xx",
    recordOnly: true,
  },
  {
    id: "RB-15",
    title: "Export a large workspace in parts",
    scope: "Full workspace export times out; smaller date ranges or projects work",
  },
  {
    id: "RB-16",
    title: "Schedule an account data deletion",
    scope:
      "Verified account owner confirms deletion in writing; export delivered or declined in writing; no active subscription or legal hold",
  },
];

// The open queue at the 07:00 ET start. Raised by internal teams, never by customers directly.
export const TICKETS: SaasTicket[] = [
  {
    id: "T-3001",
    opened: "Mon 08:05",
    from: "Support chat",
    account: "Northwind Labs",
    plan: "Business",
    text: "Whole team of 40 cannot sign in since the admin rotated the SSO certificate this morning. Every login ends on an error page.",
  },
  {
    id: "T-3002",
    opened: "Mon 08:40",
    from: "Support chat",
    account: "Blue Fern Studio",
    plan: "Team",
    text: "User replaced their phone and the authenticator did not move over. Locked out by two-factor. Another admin confirmed it is them.",
  },
  {
    id: "T-3003",
    opened: "Mon 09:10",
    from: "Billing ops",
    account: "Oak & Pine",
    plan: "Business",
    text: "Card charged twice for the March invoice. Payment processor shows two captures for the same invoice number.",
  },
  {
    id: "T-3004",
    opened: "Mon 09:35",
    from: "Customer success",
    account: "Harbor Analytics",
    plan: "Enterprise",
    text: "Webhook deliveries to their endpoint failed for two hours overnight while their server was down. Endpoint answers 200 again now.",
  },
  {
    id: "T-3005",
    opened: "Mon 10:02",
    from: "Status monitor",
    account: "-",
    plan: "-",
    text: "[ALERT-8841] API p95 latency above 4 s in all regions for 12 minutes. Recovered by itself at 09:58. No follow-up alerts.",
  },
  {
    id: "T-3006",
    opened: "Mon 10:30",
    from: "Customer success",
    account: "Lumen Health",
    plan: "Enterprise",
    text: "Full workspace export times out after 30 minutes. Exporting a single project works.",
  },
  {
    id: "T-3007",
    opened: "Mon 11:15",
    from: "Support chat",
    account: "Quill & Co",
    plan: "Team",
    text: "Gantt view shows tasks one day early for users in Sydney. Dates are right in the list view.",
  },
  {
    id: "T-3008",
    opened: "Mon 11:50",
    from: "Account management",
    account: "Riverstone Legal",
    plan: "Business",
    text: "Account owner asks us to delete all their data. Export already delivered last week. Subscription was cancelled in October.",
  },
  {
    id: "T-3009",
    opened: "Mon 12:20",
    from: "Support chat",
    account: "Copperline",
    plan: "Team",
    text: "Guest set to comment-only on one project can still edit task due dates in the timeline view. Reproduced in the support sandbox.",
  },
  {
    id: "T-3010",
    opened: "Mon 13:05",
    from: "Customer success",
    account: "Harbor Analytics",
    plan: "Enterprise",
    text: "Follow-up on T-3004: their second webhook endpoint, for billing events, is still returning 429 on test deliveries. The main endpoint is healthy.",
  },
  {
    id: "T-3011",
    opened: "Mon 13:40",
    from: "Support chat",
    account: "Saffron Foods",
    plan: "Business",
    text: "Customer upgraded from Team to Business mid-cycle and disputes the prorated charge on the March invoice. Needs a breakdown from billing.",
  },
  {
    id: "T-3012",
    opened: "Mon 14:25",
    from: "Support chat",
    account: "Granite Partners",
    plan: "Business",
    text: "Admin deleted an active project board by mistake yesterday and asks us to restore it.",
  },
  {
    id: "T-3013",
    opened: "Mon 15:00",
    from: "Customer success",
    account: "Atlas Robotics",
    plan: "Enterprise",
    text: "Webhooks to their endpoint still failing with 500 errors this morning. Their team says the endpoint is under maintenance.",
  },
  {
    id: "T-3014",
    opened: "Mon 15:45",
    from: "Support chat",
    account: "Pebble Design",
    plan: "Free",
    text: "Dashboard takes over a minute to load for one user. Others on the same workspace are fine.",
  },
  {
    id: "T-3015",
    opened: "Mon 16:20",
    from: "Support chat",
    account: "Kestrel Media",
    plan: "Team",
    text: "Customer says they were charged twice this month. The two charges are for two different invoices: the seat add-on and the monthly plan.",
  },
  {
    id: "T-3016",
    opened: "Tue 08:10",
    from: "Security",
    account: "Atlas Robotics",
    plan: "Enterprise",
    text: "Secret-scanning alert matched an active workspace API key in a public repository. Security revoked it; the workspace admins need to rotate it and check API logs.",
  },
  {
    id: "T-3017",
    opened: "Tue 08:55",
    from: "Account management",
    account: "Granite Partners",
    plan: "Business",
    text: "Owner asks to delete the account today. They still have an active annual subscription until June.",
  },
  {
    id: "T-3018",
    opened: "Tue 09:30",
    from: "Support chat",
    account: "Blue Fern Studio",
    plan: "Team",
    text: "Feature request: export the task board as a PDF for weekly client reports.",
  },
  {
    id: "T-3019",
    opened: "Tue 10:15",
    from: "Customer success",
    account: "Lumen Health",
    plan: "Enterprise",
    text: "Export of all 2025 projects times out again. A three-month range finished fine.",
  },
  {
    id: "T-3020",
    opened: "Tue 11:00",
    from: "Status monitor",
    account: "-",
    plan: "-",
    text: "Sign-in page returning 503 for 6 minutes for all customers. Error rate back to normal now, incident still open.",
  },
  {
    id: "T-3021",
    opened: "Tue 11:40",
    from: "Support chat",
    account: "Oak & Pine",
    plan: "Business",
    text: "Task assignment emails stopped reaching everyone at Oak & Pine since Friday. Our mail log shows their domain bounced and is on the suppression list.",
  },
];

// Closed tickets from the last 21 days, with how they were resolved. The resolution starts with the runbook id when
// a runbook resolved it.
export const HISTORY: SaasHistoryItem[] = [
  {
    id: "H-3101",
    day: -20,
    account: "Copperline",
    fw: "-",
    text: "Webhook deliveries failed while the customer endpoint was down for a deploy.",
    resolution: "RB-14: deliveries replayed after the endpoint recovered.",
  },
  {
    id: "H-3102",
    day: -18,
    account: "Atlas Robotics",
    fw: "-",
    text: "Workspace locked out after identity provider settings changed.",
    resolution: "RB-11: temporary bypass for the admin; IdP certificate fixed by the customer.",
  },
  {
    id: "H-3103",
    day: -17,
    account: "Quill & Co",
    fw: "-",
    text: "User lost their phone, two-factor codes gone.",
    resolution: "RB-12: reset after the other admin confirmed identity.",
  },
  {
    id: "H-3104",
    day: -15,
    account: "Harbor Analytics",
    fw: "-",
    text: "Missed webhook events after a firewall change on their side.",
    resolution: "RB-14: replayed once their firewall allowed our IP range.",
  },
  {
    id: "H-3105",
    day: -14,
    account: "Saffron Foods",
    fw: "-",
    text: "Charged twice for one invoice after a retry.",
    resolution: "RB-13: duplicate capture refunded, receipt sent.",
  },
  {
    id: "H-3106",
    day: -12,
    account: "Lumen Health",
    fw: "-",
    text: "Full export timed out.",
    resolution: "RB-15: exported by project in five parts.",
  },
  {
    id: "H-3107",
    day: -11,
    account: "Pebble Design",
    fw: "-",
    text: "Webhook endpoint returned 502 for an hour.",
    resolution: "RB-14: replayed the failed deliveries.",
  },
  {
    id: "H-3108",
    day: -10,
    account: "Kestrel Media",
    fw: "-",
    text: "Asked how seat billing works.",
    resolution: "Answered with the pricing page; no runbook.",
  },
  {
    id: "H-3109",
    day: -9,
    account: "Oak & Pine",
    fw: "-",
    text: "Calendar sync to Google stopped after a token expired.",
    resolution: "Customer reconnected the integration; no runbook.",
  },
  {
    id: "H-3110",
    day: -7,
    account: "Vantage Retail",
    fw: "-",
    text: "Owner requested account deletion after cancelling.",
    resolution: "RB-16: deletion scheduled after the export was delivered.",
  },
  {
    id: "H-3111",
    day: -6,
    account: "Northwind Labs",
    fw: "-",
    text: "Webhook deliveries failing with 401 after the customer rotated their signing secret without updating the workspace settings.",
    resolution:
      "Customer updated the secret in workspace settings; failed deliveries from the window replayed via RB-14.",
  },
  {
    id: "H-3112",
    day: -5,
    account: "Granite Partners",
    fw: "-",
    text: "Board view slow for every user on a large workspace.",
    resolution: "Escalated to engineering: missing index, fixed in a release.",
  },
  {
    id: "H-3113",
    day: -4,
    account: "Quill & Co",
    fw: "-",
    text: "Second two-factor reset request on the same workspace within two weeks.",
    resolution: "RB-12: reset after a video call with Security and the workspace owner.",
  },
  {
    id: "H-3114",
    day: -3,
    account: "Blue Fern Studio",
    fw: "-",
    text: "Webhook deliveries failed during their scheduled maintenance.",
    resolution: "RB-14: replayed after maintenance ended.",
  },
  {
    id: "H-3115",
    day: -1,
    account: "Harbor Analytics",
    fw: "-",
    text: "Export of a 3-year archive timed out.",
    resolution: "RB-15: exported per year.",
  },
];

/** The ticket the new-ticket check starts from. */
export const NEW_TICKET_EXAMPLE =
  "Customer says webhook deliveries failed for 40 minutes while their endpoint was being redeployed. It answers 200 again now.";
