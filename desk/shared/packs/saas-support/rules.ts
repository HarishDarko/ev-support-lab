// SaaS support pack: the keyword rules of the deterministic triage fallback and the runbook exceptions. Built only
// from the pack's synthetic data.
import type { RunbookExceptionRule, TriageRule } from "../types";
import type { Component } from "./data";

// The first rule that matches decides, so the incident's three rules come first: a ticket about our client being
// blocked, the token-request alert, and any webhook ticket, even one that names the customer's identity provider.
export const RULES: TriageRule<Component>[] = [
  {
    re: /compromised|blocked our oauth client/i,
    component: "integration",
    severity: "S1",
    action: "escalation_candidate",
    runbook: "none",
    why: "our client blocked, security asks",
  },
  {
    re: /oauth token requests/i,
    component: "integration",
    severity: "S2",
    action: "escalation_candidate",
    runbook: "none",
    why: "token request spike",
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

export const EXCEPTIONS: Record<string, RunbookExceptionRule[]> = {
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
