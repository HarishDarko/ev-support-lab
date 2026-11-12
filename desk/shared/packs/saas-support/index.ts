// The SaaS support pack: the internal support desk of a made-up project-management product, with the token-refresh
// storm incident (INC-0527). Everything in this folder is synthetic data made up for a prototype.
import type { Pack } from "../types";
import {
  COMPONENTS,
  HISTORY,
  NEW_TICKET_EXAMPLE,
  RUNBOOKS,
  TICKETS,
  type Component,
  type SaasHistoryItem,
  type SaasTicket,
} from "./data";
import { CHANGE_REF, INCIDENT_ID } from "./incident";
import { META } from "./meta";
import { EXCEPTIONS, RULES } from "./rules";

export const SYSTEM = `You work inside an internal production-support desk for a company that sells a project-management product to businesses. The support desk serves internal teams (support chat, customer success, billing ops, account management, security, the status monitor), not customers directly.

Everything you are given is synthetic data made up for a prototype.

Rules:
- Never invent names of people. Refer to roles only (customer, workspace admin, support, billing ops, security, engineering).
- Never invent business figures such as revenue, cost, savings or customer counts. Use only numbers present in the input.
- Use only facts in the input. If something is not in the input, say it is unknown.
- Never ask for or repeat passwords, API keys or other secrets.
- A pattern across tickets is a correlation. State causes as hypotheses, never as proven.
- Write plainly and briefly, the way an experienced support engineer writes for colleagues. No marketing language, no lecturing.`;

export const SAAS_SUPPORT = {
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
    "login-access": ["sign in", "login", "sso", "saml", "two-factor", "authenticator", "locked"],
    billing: ["charge", "invoice", "billing", "prorated", "refund"],
    bug: ["shows", "error", "wrong", "early", "broken"],
    performance: ["latency", "slow", "load", "503", "minute"],
    integration: ["webhook", "api key", "integration", "endpoint", "oauth", "token"],
    "data-request": ["export", "delete", "deletion", "data"],
    "request-or-question": [],
  },
  runbookTerms: {
    "RB-11": ["sso", "saml", "identity provider"],
    "RB-12": ["two-factor", "authenticator"],
    "RB-13": ["charged", "charge", "capture"],
    "RB-14": ["webhook"],
    "RB-15": ["export"],
    "RB-16": ["delete", "deletion"],
  },
  runbookFits: {
    "RB-11": ["login-access"],
    "RB-12": ["login-access"],
    "RB-13": ["billing"],
    "RB-14": ["integration"],
    "RB-15": ["data-request"],
    "RB-16": ["data-request"],
  },
  runbookExceptions: EXCEPTIONS,
  recordOnly: {
    runbook: "RB-14",
    confirmStep: "Confirm the customer's endpoint answers 200 to a test delivery, before RB-14.",
    reviewStep: "Note the replayed event range on the ticket so the customer can check for duplicates.",
    confirmNote: "Before RB-14, a person checks the endpoint answers 200. The check above reads wording only.",
  },
  prompts: {
    system: SYSTEM,
    severityGuide:
      "Severity: S1 product down for many customers, or a security risk. S2 billing or data correctness, or one customer's whole team blocked. S3 one feature or one user degraded. S4 question, request or cosmetic.",
    componentGuide:
      "the best fit for what the ticket literally describes. login-access: sign-in, SSO and two-factor. integration: webhooks, API keys and connected apps. performance: slow, timing out or down. data-request: exports and deletion requests. request-or-question: plain questions and feature requests.",
    actionGuide:
      "close_with_runbook only if one of the runbooks below fully resolves it without code or config changes; escalation_candidate if it likely needs engineering or security; info_only for alerts that already cleared or plain questions you can answer; otherwise needs_human",
    ticketLine: (t: SaasTicket) =>
      `${t.id} | opened ${t.opened} ET | from ${t.from} | account ${t.account} | plan ${t.plan} | ${t.text}`,
    historyLine: (h: SaasHistoryItem) =>
      `${h.id} | day ${h.day} | account ${h.account} | ${h.text} | resolution: ${h.resolution}`,
  },
} satisfies Pack<Component, SaasTicket, SaasHistoryItem>;
