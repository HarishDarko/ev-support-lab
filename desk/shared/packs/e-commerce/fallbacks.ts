// E-commerce pack: the deterministic fallback for the incident steps (investigate, handoff, verify, KB, shift note,
// new-ticket check). Built only from the synthetic data and the lab's committed results, so it never invents
// anything.
import { exceptionIn } from "../../../functions/_lib/checks";
import { ruleTriageFor } from "../../../functions/_lib/rule-engine";
import type { ShiftSummary } from "../types";
import { TICKETS } from "./data";
import { INCIDENT } from "./incident";
import { RESULTS } from "./results";
import { EXCEPTIONS, RULES } from "./rules";

const RULE_PACK = { rules: RULES, runbookExceptions: EXCEPTIONS, defaultComponent: "request-or-question" as const };
const answers = INCIDENT.orders.map((o) => o.firstAnswer);
const total = INCIDENT.breakdown.reduce(
  (s, b) => ({ slow: s.slow + b.slow, secondAuth: s.secondAuth + b.secondAuth }),
  {
    slow: 0,
    secondAuth: 0,
  },
);
const c = RESULTS.canary;
const k = RESULTS.control;

export function ruleInvestigate() {
  return {
    symptom:
      "Orders are held in Payment pending although the customer paid once, and two customers were charged twice. Every affected order's first payment answer took longer than checkout's 8 second timeout.",
    impact: [
      `${INCIDENT.totalTickets} tickets on ${INCIDENT.totalTickets} orders from ${INCIDENT.channels.length} channels over 21 days.`,
      "Held orders missed their pick list and their delivery promise.",
      `${INCIDENT.chargedTwice} customers were charged twice for one order.`,
    ],
    evidence: [
      {
        point: `Every affected order's first answer took ${Math.min(...answers)} to ${Math.max(...answers)} s, over the ${INCIDENT.timeoutSeconds} s timeout.`,
        source: "Order timings",
        quote: "",
      },
      {
        point: "The second attempt went out with a new idempotency key, so the processor made a second authorization.",
        source: "Log #51102",
        quote: "extra authorization au_96FA on a captured order",
      },
      {
        point: "The app's automatic retry raced the first answer, and both authorizations were captured.",
        source: "Log #51209",
        quote: "#51209 two captures -> hold: Payment pending",
      },
      {
        point: `${total.secondAuth} of ${total.slow} slow first answers in 21 days led to a second authorization; no checkout answered under 8 s was affected.`,
        source: "Channel view, 21 days",
        quote: "",
      },
    ],
    hypotheses: [
      {
        statement:
          "Checkout makes a new idempotency key for each attempt, so a retry after a slow answer creates a second authorization, and the order service holds or double-captures the order.",
        status: "leading hypothesis",
        supports: ["Two keys for one order in the #51102 log.", "Every affected order's first answer took over 8 s."],
        against_or_gaps: [
          "The processor's own logs are not available to support.",
          "Full logs exist for four of the nine orders.",
        ],
      },
      {
        statement:
          "The processor sends authorization webhooks late or twice under load, which makes the order service hold orders. May coexist with the first.",
        status: "alternative hypothesis",
        supports: ["Every affected order had a slow first answer.", "One held order (H-4109) never got its webhook."],
        against_or_gaps: [
          "Each extra authorization has its own key from our checkout.",
          "H-4109 had one authorization and one key.",
        ],
      },
    ],
    ruled_out: INCIDENT.ruledOut.map((r) => r.split(":")[0]!),
    open_questions: [
      "Should checkout reuse one idempotency key for every retry of a checkout?",
      "Should checkout look a payment up by key before showing an error?",
      "How should the order service stop two captures for one order?",
    ],
  };
}

/** Fixed wording: what the lab shows and what it does not. The model's version of this sentence is never used. */
export const HANDOFF_NOTE =
  "The second authorization is reproduced in a lab with a scripted payment processor and scripted shoppers. How the real processor answers under load is not confirmed.";
// The reproduction test passes while the bug exists (it asserts the order is held); the regression test is the one
// that fails when the fix is off. Say exactly that.
export const LAB_TEST_ATTACHMENT = "Lab tests: second authorization reproduced; regression fails without the fix";

export function ruleHandoff() {
  return {
    title: "Orders stuck in Payment pending after a slow payment retry",
    severity: "S2",
    scope: `${INCIDENT.totalTickets} tickets, ${INCIDENT.totalTickets} orders, ${INCIDENT.channels.length} channels, 21 days.`,
    rules_triggered: [...INCIDENT.escalation.fired],
    reproduction: [
      "Run the lab's reproduction test with the fix flag off: a slow first answer, then a retry with a new key.",
      "It passes by showing the bug: two keys, two authorizations, one capture, and the order held in Payment pending.",
      "Its app-race case shows the double capture: two webhooks less than 50 ms apart are both captured.",
      "Ask the payment processor how often its first answer took over 8 s in the last 21 days.",
    ],
    evidence_attached: [
      LAB_TEST_ATTACHMENT,
      "Three checkout and order log excerpts",
      "21-day channel table",
      "First-answer times for the 9 orders",
      `${INCIDENT.totalTickets} linked tickets`,
    ],
    ruled_out: INCIDENT.ruledOut.map((r) => r.split(":")[0]!),
    workaround_in_place:
      "Support releases held orders with RB-21 after the processor shows one capture, sends double captures to payments, and a proposed detector flags new cases.",
    the_ask:
      "Decide how checkout should retry a slow payment without creating a second authorization, and how the order service should stop two captures for one order.",
    hypothesis_note: HANDOFF_NOTE,
  };
}

export function ruleVerify() {
  return {
    verdict: "consistent with hypothesis",
    reading: `Canary second authorizations went from ${c.before.secondAuthorization} to ${c.after.secondAuthorization} and stuck orders from ${c.before.stuck} to ${c.after.stuck}, with ${c.after.slowFirstAnswer} slow answers; the control had ${k.after.secondAuthorization} and ${k.after.stuck}. No canary order was captured twice.`,
    what_it_does_not_prove: [
      "That the real processor answers like the lab's scripted one.",
      "That it holds beyond 14 days of scripted traffic.",
      "That other retry paths, such as saved carts, behave the same.",
    ],
    keep_watching: ["Detector hits on control stores.", "Orders held for another reason, like a lost webhook."],
    next_decision:
      "Keep the flag on the canary store for another 14 days; widen only if second authorizations stay at zero and declined cards still get a new key. A double capture on the canary reverses it.",
  };
}

export function ruleKb() {
  return {
    title: "Order stuck in Payment pending with a second authorization after a slow checkout",
    applies_when: [
      "Order says Payment pending although the customer paid once.",
      "Customer's bank shows two pending holds for one order.",
      "Checkout showed an error after a long spin, and the customer paid again.",
    ],
    how_to_confirm: [
      "Processor: two authorizations for the order, each with its own idempotency key.",
      "Checkout log: the first answer came after the 8 s timeout.",
      "Processor: exactly one capture for the order.",
    ],
    steps: [
      "Confirm the payment processor shows one capture for the order, before RB-21.",
      "Apply RB-21: release the hold and void the extra authorization.",
      "Link the ticket to the parent incident and tell the customer the extra hold drops off.",
      "Flag the order for a payments review and note the voided authorization.",
    ],
    escalate_if: [
      "The processor shows two settled captures.",
      "The order has already shipped.",
      "Only one authorization exists, as when a webhook was lost.",
      "A fraud flag is on the order.",
    ],
    status_note: `${INCIDENT.change.ref} is on the canary store; until it is on everywhere, slow payments still create second authorizations.`,
    related: [...INCIDENT.openIds, "RB-21", INCIDENT.change.ref],
  };
}

export function ruleShiftnote(summary?: ShiftSummary | null) {
  const s = summary ?? {};
  return {
    headline: `Queue started at ${s.open_at_start ?? TICKETS.length}; ${s.approved_for_closure ?? 0} approved for closure by runbook, and the second-authorization pattern is with engineering.`,
    done: [
      `${s.approved_for_closure ?? 0} tickets approved for runbook closure.`,
      "Payment pending pattern grouped and contained.",
      "Detector query written; proposed to run every 15 minutes.",
    ],
    // Every item names an owner and a deadline, as the operating model says a handover should.
    needs_you: (s.needs_a_person ?? []).slice(0, 4).map((x) => `${x} Owner: India engineering on-call, by 07:00 ET.`),
    escalated: s.escalated
      ? [
          `${s.escalated.ref}: ${s.escalated.title}`,
          "RB-21 meanwhile for newly held orders, after one capture is confirmed.",
        ]
      : ["Nothing sent to engineering yet."],
    watch: ["Detector candidates for second authorizations.", "Customers who report two holds or charges."],
  };
}

// The pattern's exceptions apply here too: a ticket outside the pattern is never routed to the runbook.
export function ruleClassify(text: string, article?: { title?: string } | null) {
  const r = ruleTriageFor(RULE_PACK, { id: "NEW", text });
  const exception =
    r.runbook === "RB-21" || /payment pending|pending holds?/i.test(text)
      ? exceptionIn(EXCEPTIONS, "RB-21", text)?.hit
      : null;
  const known = r.runbook === "RB-21" && !exception;
  return {
    component: r.component,
    severity: r.severity,
    matches_known_pattern: known,
    matched_article: known ? (article?.title ?? "none") : "none",
    suggested_action: known
      ? "Confirm the processor shows one capture, then apply RB-21, link the ticket to the parent incident and flag the order for payments review."
      : exception
        ? "Outside the known pattern: send to payments engineering with the processor's records."
        : "A person reviews it.",
    confirm: known
      ? "Before RB-21, a person checks the processor shows one capture. The check above reads wording only."
      : "",
    escalate: Boolean(exception),
    why: exception ? `Rules: the ticket says "${exception}", an exception in the article.` : r.reason,
  };
}
