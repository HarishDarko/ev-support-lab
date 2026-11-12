// E-commerce pack: the keyword rules of the deterministic triage fallback and the runbook exceptions. Built only
// from the pack's synthetic data.
import type { RunbookExceptionRule, TriageRule } from "../types";
import type { Component } from "./data";

// The first rule that matches decides, so a customer charged twice goes to payments engineering before the RB-21
// rule can see "Payment pending" (RB-21 refuses two captures). The RB-21 rule also reads "pending hold(s)", the words
// a customer's banking app uses for an open authorization (T-4018), not only the order screen's "Payment pending".
export const RULES: TriageRule<Component>[] = [
  {
    re: /charged twice|double charge|two captures|two settled charges/i,
    component: "payments",
    severity: "S2",
    action: "escalation_candidate",
    runbook: "none",
    why: "charged twice",
  },
  {
    re: /payment pending|pending holds?/i,
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

export const EXCEPTIONS: Record<string, RunbookExceptionRule[]> = {
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
