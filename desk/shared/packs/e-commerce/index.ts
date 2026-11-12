// The e-commerce pack: the internal support desk of a made-up online homeware shop, with the second-authorization
// incident (INC-0539). Everything in this folder is synthetic data made up for a prototype.
import type { Pack } from "../types";
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
import { CHANGE_REF, INCIDENT_ID } from "./incident";
import { META } from "./meta";
import { EXCEPTIONS, RULES } from "./rules";

export const SYSTEM = `You work inside an internal production-support desk for an online homeware shop. The support desk serves internal teams (customer care, payments ops, the warehouse, fraud, marketplace ops, the site monitor), not customers directly.

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
  extraIds: [INCIDENT_ID, CHANGE_REF],
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
    "RB-21": ["payment pending", "pending hold", "authorization"],
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
