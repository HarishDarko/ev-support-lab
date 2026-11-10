// The e-commerce pack: the internal support desk of a made-up online homeware shop. No incident: it runs the short
// chain. Everything in this folder is synthetic data made up for a prototype.
import type { Pack, RunbookExceptionRule, TriageRule } from "../types";
import {
  COMPONENTS,
  HISTORY,
  NEW_TICKET_EXAMPLE,
  RUNBOOKS,
  TICKETS,
  type Component,
  type ShopHistoryItem,
  type ShopTicket,
} from "./data";
import { META } from "./meta";

const RULES: TriageRule<Component>[] = [
  {
    re: /payment pending/i,
    component: "payments",
    severity: "S2",
    action: "close_with_runbook",
    runbook: "RB-21",
    why: "stuck order hold",
  },
  {
    re: /says delivered|shows delivered/i,
    component: "delivery",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-22",
    why: "delivered, not received",
  },
  {
    re: /broken|chipped|cracked|damaged/i,
    component: "product-issue",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-23",
    why: "damaged on arrival",
  },
  {
    re: /refund/i,
    component: "returns-refunds",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-24",
    why: "refund not visible",
  },
  {
    re: /change (?:the )?(?:delivery )?address/i,
    component: "order-status",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-25",
    why: "address change",
  },
  {
    re: /cannot sign in|password reset/i,
    component: "account-access",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-26",
    why: "account access",
  },
  {
    re: /checkout error|error rate/i,
    component: "payments",
    severity: "S1",
    action: "info_only",
    runbook: "none",
    why: "alert cleared",
  },
  {
    re: /failed card attempts|different countries/i,
    component: "payments",
    severity: "S2",
    action: "escalation_candidate",
    runbook: "none",
    why: "possible fraud",
  },
  {
    re: /wrong (?:colour|item|size)|picked with/i,
    component: "order-status",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "warehouse pick error",
  },
  {
    re: /wrong dimensions|product page/i,
    component: "product-issue",
    severity: "S3",
    action: "escalation_candidate",
    runbook: "none",
    why: "listing error",
  },
  {
    re: /flickers|stopped working|faulty/i,
    component: "product-issue",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "faulty item",
  },
];

const EXCEPTIONS: Record<string, RunbookExceptionRule[]> = {
  "RB-21": [
    {
      name: "customer charged twice",
      test: (text) => /charged twice|double charge|two captures|two settled charges/i.exec(text)?.[0],
    },
    { name: "order already shipped", test: (text) => /already shipped|dispatched/i.exec(text)?.[0] },
  ],
  "RB-22": [{ name: "less than 48 hours", test: (text) => /this morning|today|yesterday/i.exec(text)?.[0] }],
  "RB-24": [
    {
      name: "refund issued under 5 business days ago",
      test: (text) => /yesterday|today|[1-4] business days? ago/i.exec(text)?.[0],
    },
  ],
  "RB-25": [
    { name: "order already shipped", test: (text) => /dispatched|already shipped|shipped yesterday/i.exec(text)?.[0] },
    { name: "order already being packed", test: (text) => /\bpacking\b|label printed/i.exec(text)?.[0] },
  ],
};

const SYSTEM = `You work inside an internal production-support desk for an online homeware shop. The support desk serves internal teams (customer care, payments ops, the warehouse, fraud, marketplace ops, the site monitor), not customers directly.

Everything you are given is synthetic data made up for a prototype.

Rules:
- Never invent names of people. Refer to roles only (customer, customer care, payments ops, warehouse, carrier, engineering).
- Never invent business figures such as revenue, cost, savings or customer counts. Use only numbers present in the input.
- Use only facts in the input. If something is not in the input, say it is unknown.
- Never ask for or repeat card numbers, passwords or other secrets.
- A pattern across tickets is a correlation. State causes as hypotheses, never as proven.
- Write plainly and briefly, the way an experienced support engineer writes for colleagues. No marketing language, no lecturing.`;

export const E_COMMERCE = {
  ...META,
  fields: [...META.fields],
  newTicketExample: NEW_TICKET_EXAMPLE,
  components: COMPONENTS,
  defaultComponent: "request-or-question",
  runbooks: RUNBOOKS,
  tickets: TICKETS,
  history: HISTORY,
  extraIds: [],
  rules: RULES,
  componentTerms: {
    "order-status": ["order", "address", "picked", "status", "shipped"],
    delivery: ["delivered", "tracking", "parcel", "ship", "carrier"],
    "returns-refunds": ["refund", "return"],
    payments: ["payment", "authorization", "charged", "card", "checkout"],
    "product-issue": ["broken", "chipped", "damaged", "flickers", "dimensions", "product"],
    "account-access": ["sign in", "password", "account", "locked"],
    "request-or-question": [],
  },
  runbookTerms: {
    "RB-21": ["payment pending", "authorization"],
    "RB-22": ["delivered"],
    "RB-23": ["broken", "chipped", "cracked", "damaged"],
    "RB-24": ["refund"],
    "RB-25": ["address"],
    "RB-26": ["sign in", "password"],
  },
  runbookFits: {
    "RB-21": ["payments", "order-status"],
    "RB-22": ["delivery"],
    "RB-23": ["product-issue"],
    "RB-24": ["returns-refunds", "payments"],
    "RB-25": ["order-status", "delivery"],
    "RB-26": ["account-access"],
  },
  runbookExceptions: EXCEPTIONS,
  recordOnly: {
    runbook: "RB-21",
    confirmStep: "Confirm the payment processor shows one capture for the order, before RB-21.",
    reviewStep: "Flag the order for a payments review and note the voided authorization.",
    confirmNote: "Before RB-21, a person checks the processor shows one capture. The check above reads wording only.",
  },
  prompts: {
    system: SYSTEM,
    severityGuide:
      "Severity: S1 checkout or payments down for many customers. S2 money taken wrongly, or many orders affected. S3 one order late, damaged, wrong or stuck. S4 question, request or cosmetic.",
    componentGuide:
      "the best fit for what the ticket literally describes. order-status: order changes, holds and warehouse picks. delivery: tracking and parcels. returns-refunds: returns and refunds. payments: charges, authorizations, checkout and fraud. product-issue: damaged, faulty or wrongly described items. request-or-question: plain questions and requests.",
    actionGuide:
      "close_with_runbook only if one of the runbooks below fully resolves it without code or config changes; escalation_candidate if it likely needs engineering, payments or fraud review; info_only for alerts that already cleared or plain questions you can answer; otherwise needs_human",
    ticketLine: (t: ShopTicket) =>
      `${t.id} | opened ${t.opened} ET | from ${t.from} | order ${t.order} | channel ${t.channel} | ${t.text}`,
    historyLine: (h: ShopHistoryItem) =>
      `${h.id} | day ${h.day} | order ${h.order} | ${h.text} | resolution: ${h.resolution}`,
  },
} satisfies Pack<Component, ShopTicket, ShopHistoryItem>;
