// EV charging pack: the keyword rules of the triage fallback. The first rule whose pattern matches decides.
import type { TriageRule } from "../types";
import { RUNBOOK_EXCEPTIONS } from "./guardrails";
import type { Component } from "./data";

/** The label for plain questions and requests, and for any ticket no rule matches. */
export const DEFAULT_COMPONENT: Component = "request-or-question";

export const RULES: TriageRule<Component>[] = [
  {
    re: /charging'? hours|still showed 'charging'|(?:shows?|showed) charging|in use' on the public map|already have an active session|no energy (?:change|flowing)|energy (?:is )?not flowing|energy stopped climbing|open \d+h/i,
    component: "session-state",
    severity: "S2",
    action: "close_with_runbook",
    runbook: "RB-05",
    why: "stuck session",
  },
  {
    re: /no response|earlier offline events|third (?:offline )?event/i,
    component: "connectivity",
    severity: "S3",
    action: "needs_human",
    runbook: "RB-03",
    why: "reset already tried",
  },
  {
    re: /heartbeat|offline/i,
    component: "connectivity",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-03",
    why: "charger offline",
  },
  {
    re: /badge|rfid|auth list|card list/i,
    component: "authorization",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-01",
    why: "card authorization",
  },
  {
    re: /\bhold\b/i,
    component: "payments",
    severity: "S4",
    action: "close_with_runbook",
    runbook: "RB-02",
    why: "stale payment hold",
  },
  {
    re: /export/i,
    component: "host-portal",
    severity: "S4",
    action: "close_with_runbook",
    runbook: "RB-04",
    why: "large export",
  },
  {
    re: /locked out/i,
    component: "host-portal",
    severity: "S3",
    action: "close_with_runbook",
    runbook: "RB-06",
    why: "portal access",
  },
  {
    re: /auto-resolved/i,
    component: "platform-api",
    severity: "S4",
    action: "info_only",
    runbook: "none",
    why: "alert already cleared",
  },
  {
    re: /price|dollars|\$0\./i,
    component: "driver-app",
    severity: "S4",
    action: "needs_human",
    runbook: "none",
    why: "pricing display",
  },
  {
    re: /holster|cable|\bpart\b/i,
    component: "hardware-field",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "physical damage",
  },
  {
    re: /time-of-use|pricing works/i,
    component: "pricing",
    severity: "S4",
    action: "needs_human",
    runbook: "RB-07",
    why: "pricing question",
  },
  {
    re: /roaming/i,
    component: "roaming",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "roaming data",
  },
  {
    re: /closes on launch|android/i,
    component: "driver-app",
    severity: "S3",
    action: "needs_human",
    runbook: "none",
    why: "app crash",
  },
];

/** What the rules engine needs: the rules, the runbook exceptions and the default label. */
export const TRIAGE_RULES = {
  rules: RULES,
  runbookExceptions: RUNBOOK_EXCEPTIONS,
  defaultComponent: DEFAULT_COMPONENT,
};
