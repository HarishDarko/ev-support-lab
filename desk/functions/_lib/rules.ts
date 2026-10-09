// Deterministic fallback for every step. Used when a live call fails, is rate limited,
// or returns output that fails validation. Built only from the synthetic data, so it never invents anything.
import {
  TICKETS,
  HISTORY,
  HERO,
  ENGINEERING_CHANGE,
  VERIFICATION,
  RUNBOOKS,
  type Component,
  type Ticket,
} from "../../shared/synthetic";
import { runbookException } from "./validate";

export type Severity = "S1" | "S2" | "S3" | "S4";
export type TriageAction = "close_with_runbook" | "needs_human" | "escalation_candidate" | "info_only";

interface Rule {
  re: RegExp;
  component: Component;
  severity: Severity;
  action: TriageAction;
  runbook: string;
  why: string;
}

const RULES: Rule[] = [
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

const words = (text: string, n: number): string =>
  text
    .split(/\s+/)
    .slice(0, n)
    .join(" ")
    .replace(/[.,;:]$/, "");

/** The ticket fields the rules read. A new, unsaved ticket has no firmware. */
export type TriageTicket = Pick<Ticket, "id" | "text"> & { fw?: string };

export interface RuleTriageResult {
  id: string;
  summary: string;
  component: Component;
  severity: Severity;
  action: TriageAction;
  runbook: string;
  confidence: number;
  reason: string;
  evidence: string;
}

export function ruleTriage(ticket: TriageTicket): RuleTriageResult {
  const rule = RULES.find((r) => r.re.test(ticket.text));
  const match = rule ? ticket.text.match(rule.re)?.[0] : "";
  // The same runbook exceptions as the AI path: a closure outside the runbook's scope goes to a person.
  const exception =
    rule?.action === "close_with_runbook" ? runbookException(rule.runbook, ticket.text, ticket.fw) : null;
  return {
    id: ticket.id,
    summary: words(ticket.text, 9),
    component: rule?.component ?? "request-or-question",
    severity: rule?.severity ?? "S4",
    action: exception ? "needs_human" : (rule?.action ?? "needs_human"),
    runbook: rule?.runbook ?? "none",
    confidence: rule ? 0.6 : 0.3,
    reason: exception
      ? `Rules fallback: matched "${match}", but ${rule!.runbook} doesn't apply (${exception.name}: "${exception.hit}").`
      : rule
        ? `Rules fallback: matched "${match}" (${rule.why}).`
        : "Rules fallback: no rule matched, so a person decides.",
    evidence: match || words(ticket.text, 6),
  };
}

export function rulePatterns() {
  const groups = new Map<string, { rule: Rule | undefined; ids: string[] }>();
  for (const t of TICKETS) {
    const r = ruleTriage(t);
    if (r.component === "request-or-question") continue;
    const key = `${r.component}|${r.runbook}`;
    if (!groups.has(key))
      groups.set(key, { rule: RULES.find((x) => x.component === r.component && x.runbook === r.runbook), ids: [] });
    groups.get(key)!.ids.push(t.id);
  }
  const out = [];
  for (const { rule, ids } of groups.values()) {
    if (ids.length < 2 || !rule) continue;
    const history = HISTORY.filter(
      (h) =>
        rule.re.test(h.text) ||
        h.resolution.startsWith(`${rule.runbook}:`) ||
        h.resolution.startsWith(`${rule.runbook} `),
    ).map((h) => h.id);
    out.push({
      name: rule.why.charAt(0).toUpperCase() + rule.why.slice(1),
      ticket_ids: ids,
      history_ids: history,
      recurring: history.length > 0,
      why_grouped: `Same keyword rule (${rule.why}) and runbook ${rule.runbook}.`,
      next_step:
        rule.runbook !== "none" ? `Apply ${rule.runbook} and review the pattern.` : "A person reviews the group.",
    });
  }
  return { patterns: out };
}

const fb = HERO.fleet;
export function ruleInvestigate() {
  return {
    symptom:
      "Sessions stay open in the backend after the driver unplugs, while the charger reports the connector Available. Drivers are billed idle fees or blocked from new sessions, and hosts see empty bays marked in use.",
    impact: [
      `${HERO.totalTickets} tickets at ${HERO.sites.length} sites over 21 days.`,
      "Idle fees charged for time nobody was parked.",
      "Drivers blocked from starting sessions elsewhere.",
    ],
    evidence: [
      {
        point: `Every stuck session had a connection drop between ${Math.min(...HERO.unplugToDropSec.map((g) => g.s))} and ${Math.max(...HERO.unplugToDropSec.map((g) => g.s))} seconds after unplug.`,
        source: "Unplug-to-drop timings",
        quote: "",
      },
      {
        point: "On FW-A the Ended event arrived after reconnect and the backend ignored it as out of order.",
        source: "Log CP-022-04",
        quote: "ignored: connector already Available (out of order)",
      },
      {
        point: "On FW-B the gateway shows no Ended event after the reconnect; the session stayed Charging.",
        source: "Log CP-014-02",
        quote: "(no TransactionEvent Ended received)",
      },
      {
        point: `Drops near unplug ended stuck ${fb[0]!.stuck} of ${fb[0]!.dropsNearUnplug} times on FW-B, ${fb[1]!.stuck} of ${fb[1]!.dropsNearUnplug} on FW-A, ${fb[2]!.stuck} of ${fb[2]!.dropsNearUnplug} on FW-C.`,
        source: "Fleet view, 21 days",
        quote: "",
      },
    ],
    hypotheses: [
      {
        statement:
          "The backend ignores an Ended event that arrives after the EVSE reports Available, leaving the transaction open.",
        status: "leading hypothesis",
        supports: ["Seen directly in the CP-022-04 log.", "Every case follows a reconnect near unplug."],
        against_or_gaps: ["Only one log shows a late Ended event.", "Does not explain FW-B logs with no Ended event."],
      },
      {
        statement:
          "FW-B does not send its queued Ended event after the websocket reconnects. May coexist with the first.",
        status: "alternative hypothesis",
        supports: ["12 of 14 cases are on FW-B.", "No Ended event at the gateway after reconnect."],
        against_or_gaps: ["Inferred from absence; could be a capture gap.", "No charger-side logs to confirm."],
      },
    ],
    ruled_out: HERO.ruledOut.map((r) => r.split(":")[0]!),
    open_questions: [
      "Is ignoring a late Ended event after Available intended behaviour?",
      "Does FW-B keep queued TransactionEvents across a websocket reconnect?",
      "Is gateway capture complete during reconnects?",
    ],
  };
}

/** Fixed wording: what the lab shows and what it does not. The model's version of this sentence is never used. */
export const HANDOFF_NOTE =
  "The backend ignoring a late Ended is reproduced in a lab with a simulated charger. Whether FW-B drops its queued Ended is not confirmed.";
// The reproduction test passes while the bug exists (it asserts the session stays open); the regression test is the
// one that fails when the fix is off. Say exactly that.
export const LAB_TEST_ATTACHMENT = "Lab tests: bug reproduced; regression fails without the fix";

export function ruleHandoff() {
  return {
    title: "Sessions stay open after a charger reconnects near unplug",
    severity: "S2",
    scope: `${HERO.totalTickets} tickets, ${HERO.sites.length} sites, two firmware lines, 21 days.`,
    rules_triggered: ["code", "spread", "billing"],
    reproduction: [
      "Run the lab's reproduction test with the fix flag off: a simulated charger unplugs, reconnects, then sends a late Ended.",
      "It passes by showing the bug: the backend ignores the Ended and the transaction stays Charging.",
      "Compare with the gateway log: EVCommunicationLost, websocket 1006, Available, then the Ended ignored as out of order.",
      "On a FW-B 4.2.x test charger with capture on, drop the connection before the Ended is sent and check whether it is ever sent.",
    ],
    evidence_attached: [
      LAB_TEST_ATTACHMENT,
      "Three OCPP 2.0.1 log excerpts",
      "21-day fleet table by firmware",
      "Unplug-to-drop timings",
      `${HERO.totalTickets} linked tickets`,
    ],
    ruled_out: HERO.ruledOut.map((r) => r.split(":")[0]!),
    workaround_in_place:
      "Support closes stuck sessions with RB-05 and flags invoices for review; a proposed detector would flag new candidates for review within 45 minutes.",
    the_ask:
      "Decide how the backend should close a transaction left open after a reconnect without billing errors, and whether a late Ended event should be applied instead of ignored.",
    hypothesis_note: HANDOFF_NOTE,
  };
}

export function ruleVerify() {
  const v = VERIFICATION;
  const c = v.correctness;
  return {
    verdict: "consistent with hypothesis",
    reading: `Canary stuck sessions went from ${v.canary.before.stuck} to ${v.canary.after.stuck} while drops near unplug continued; control stayed at ${v.control.after.stuck}. No false closures or duplicate charges in ${c.canarySessions} canary sessions.`,
    what_it_does_not_prove: [
      "Which mechanism causes the missing Ended event.",
      "That it holds beyond two weeks and five events.",
      "That provisional billing is right without review.",
    ],
    keep_watching: ["Provisional invoices and their adjustments.", "Detector hits on control sites."],
    next_decision:
      "Keep the flag on the canary sites for another 14 days; widen only if billing reviews stay clean. A false closure or duplicate charge reverses it.",
  };
}

export function ruleKb() {
  return {
    title: "Session stuck in Charging after the charger reconnects",
    applies_when: [
      "App or map shows Charging after the driver left.",
      "Idle fee complaint with flat energy.",
      "Driver told a session is already active.",
    ],
    how_to_confirm: [
      "Gateway log: no TransactionEvent Ended after the unplug event.",
      "Gateway log: connection lost and back within 90 seconds of unplug.",
      "EVSE reports Available while the transaction is open.",
    ],
    steps: [
      "Confirm the meter shows no energy change since unplug, before RB-05.",
      "Apply RB-05: close at the session's last recorded meter value.",
      "Reverse idle fees from the last meter change.",
      "Flag the invoice for billing review and link the ticket to the parent incident.",
    ],
    escalate_if: [
      "No connection drop near unplug.",
      "Energy still climbing on the open session.",
      "Firmware line other than FW-A or FW-B.",
      "A newer session already started on the same connector.",
    ],
    status_note: `${ENGINEERING_CHANGE.ref} reconciliation is on canary sites with billing marked provisional; the FW-B firmware question is open with the vendor.`,
    related: [...HERO.openIds, "RB-05", ENGINEERING_CHANGE.ref],
  };
}

/** The shift summary the client sends to the end-of-shift note. Client-supplied, so every field is optional. */
export interface ShiftSummary {
  open_at_start?: number;
  approved_for_closure?: number;
  needs_a_person?: string[];
  escalated?: { ref: string; title: string };
}

export function ruleShiftnote(summary?: ShiftSummary | null) {
  const s = summary ?? {};
  return {
    headline: `Queue started at ${s.open_at_start ?? TICKETS.length}; ${s.approved_for_closure ?? 0} approved for closure by runbook, and the stuck-session pattern is with engineering.`,
    done: [
      `${s.approved_for_closure ?? 0} tickets approved for runbook closure.`,
      "Stuck-session pattern grouped and contained.",
      "Detector query written; proposed to run every 15 minutes.",
    ],
    // Every item names an owner and a deadline, as the operating model says a handover should.
    needs_you: (s.needs_a_person ?? []).slice(0, 4).map((x) => `${x} Owner: India engineering on-call, by 07:00 ET.`),
    escalated: s.escalated
      ? [`${s.escalated.ref}: ${s.escalated.title}`, "RB-05 meanwhile for new stuck sessions."]
      : ["Nothing sent to engineering yet."],
    watch: ["Detector candidates for stuck sessions.", "Repeat offline alerts."],
  };
}

// The pattern's exceptions apply here too: a ticket outside the pattern is never routed to the runbook.
export function ruleClassify(text: string, article?: { title?: string } | null) {
  const r = ruleTriage({ id: "NEW", text });
  const exception =
    r.component === "session-state" || /session|charging|energy/i.test(text)
      ? runbookException("RB-05", text)?.hit
      : null;
  const known = r.component === "session-state" && !exception;
  return {
    component: r.component,
    severity: r.severity,
    matches_known_pattern: known,
    matched_article: known ? (article?.title ?? "none") : "none",
    suggested_action: known
      ? "Confirm the meter is flat, then apply RB-05, reverse idle fees, flag the invoice and link to the parent incident."
      : exception
        ? "Outside the known pattern: send to engineering with the logs."
        : "A person reviews it.",
    confirm: known
      ? "Before RB-05, a person checks the meter shows no energy change since unplug. The check above reads wording only."
      : "",
    escalate: Boolean(exception),
    why: exception ? `Rules: the ticket says "${exception}", an exception in the article.` : r.reason,
  };
}

export const RUNBOOK_IDS: Set<string> = new Set(RUNBOOKS.map((r) => r.id));
