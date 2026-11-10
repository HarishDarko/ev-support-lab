// The SaaS support pack: the internal support desk of a made-up project-management product. No incident: it runs
// the short chain. Everything in this folder is synthetic data made up for a prototype.
import type { Pack, RunbookExceptionRule, TriageRule } from "../types";
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
import { META } from "./meta";

const RULES: TriageRule<Component>[] = [
  {
    re: /\bsso\b|saml|identity provider/i,
    component: "login-access",
    severity: "S2",
    action: "close_with_runbook",
    runbook: "RB-11",
    why: "SSO lockout",
  },
  {
    re: /two-factor|authenticator/i,
    component: "login-access",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-12",
    why: "two-factor reset",
  },
  {
    re: /charged twice|two captures|two charges/i,
    component: "billing",
    severity: "S2",
    action: "close_with_runbook",
    runbook: "RB-13",
    why: "duplicate charge",
  },
  {
    re: /webhook/i,
    component: "integration",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-14",
    why: "failed webhook deliveries",
  },
  {
    re: /\bexport\b/i,
    component: "data-request",
    severity: "S4",
    action: "close_with_runbook",
    runbook: "RB-15",
    why: "large export",
  },
  {
    re: /\bdelete\b|deletion/i,
    component: "data-request",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-16",
    why: "deletion request",
  },
  {
    re: /api key/i,
    component: "integration",
    severity: "S1",
    action: "escalation_candidate",
    runbook: "none",
    why: "exposed API key",
  },
  {
    re: /\b503\b|latency|recovered by itself|back to normal/i,
    component: "performance",
    severity: "S2",
    action: "info_only",
    runbook: "none",
    why: "alert cleared",
  },
  {
    re: /over a minute|\bslow\b/i,
    component: "performance",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "slow for one user",
  },
  {
    re: /prorated|how .* worked out/i,
    component: "billing",
    severity: "S4",
    action: "info_only",
    runbook: "none",
    why: "billing question",
  },
  {
    re: /one day early|wrong date|\berror\b/i,
    component: "bug",
    severity: "S3",
    action: "escalation_candidate",
    runbook: "none",
    why: "display bug",
  },
];

const EXCEPTIONS: Record<string, RunbookExceptionRule[]> = {
  "RB-11": [{ name: "requester is not an admin", test: (text) => /not (?:an|the) admin/i.exec(text)?.[0] }],
  "RB-12": [
    { name: "identity not confirmed", test: (text) => /could not (?:confirm|verify)|not confirmed/i.exec(text)?.[0] },
  ],
  "RB-13": [{ name: "not the same invoice", test: (text) => /different invoices|two invoices/i.exec(text)?.[0] }],
  "RB-14": [
    {
      name: "endpoint still failing",
      test: (text) => /still (?:failing|returning \d{3}|down)|under maintenance/i.exec(text)?.[0],
    },
    { name: "signing secret changed", test: (text) => /signing secret|invalid signature/i.exec(text)?.[0] },
  ],
  "RB-16": [
    {
      name: "subscription or hold still active",
      test: (text) => /active (?:annual |monthly )?subscription|legal hold/i.exec(text)?.[0],
    },
  ],
};

const SYSTEM = `You work inside an internal production-support desk for a company that sells a project-management product to businesses. The support desk serves internal teams (support chat, customer success, billing ops, account management, security, the status monitor), not customers directly.

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
  extraIds: [],
  rules: RULES,
  componentTerms: {
    "login-access": ["sign in", "login", "sso", "saml", "two-factor", "authenticator", "locked"],
    billing: ["charge", "invoice", "billing", "prorated", "refund"],
    bug: ["shows", "error", "wrong", "early", "broken"],
    performance: ["latency", "slow", "load", "503", "minute"],
    integration: ["webhook", "api key", "integration", "endpoint"],
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
