// SaaS support pack: the deterministic fallback for the incident steps (investigate, handoff, verify, KB, shift
// note, new-ticket check). Built only from the synthetic data and the lab's committed results, so it never invents
// anything.
import { exceptionIn } from "../../../functions/_lib/checks";
import { ruleTriageFor } from "../../../functions/_lib/rule-engine";
import type { ShiftSummary } from "../types";
import { TICKETS } from "./data";
import { INCIDENT } from "./incident";
import { RESULTS } from "./results";
import { EXCEPTIONS, RULES } from "./rules";

const RULE_PACK = { rules: RULES, runbookExceptions: EXCEPTIONS, defaultComponent: "request-or-question" as const };
const inFlight = INCIDENT.storms.map((s) => s.inFlight);
const burst = INCIDENT.breakdown[1]!;
const c = RESULTS.canary;
const k = RESULTS.control;

export function ruleInvestigate() {
  return {
    symptom:
      "Customers' webhook endpoints are paused after repeated failures although their servers were up. Each pause starts at the top of the hour, when the endpoint's OAuth token expires during the hourly burst of events.",
    impact: [
      `${INCIDENT.totalTickets} tickets from ${INCIDENT.accounts.length} accounts over 21 days.`,
      "Customers' downstream systems missed task events until support replayed them.",
      "One customer's security team blocked our OAuth client as a possible compromise.",
    ],
    evidence: [
      {
        point: `Every storm began at a token expiry with ${Math.min(...inFlight)} to ${Math.max(...inFlight)} deliveries in flight.`,
        source: "Storm timings",
        quote: "",
      },
      {
        point:
          "Every delivery in flight asked for its own token and retried at once, so each new token revoked the last.",
        source: "Log ep_harbor_main",
        quote: "32 threads each request a new token (no shared refresh)",
      },
      {
        point: "No delivery reached Saffron Foods before the pause; only token requests went out.",
        source: "Log ep_saffron",
        quote: "POST /oauth/token -> 429 Too Many Requests",
      },
      {
        point: `${INCIDENT.rateLimited} of ${burst.burstExpiries} burst expiries hit the customer's rate limit, and those are the ${burst.pauses} OAuth pauses; HMAC endpoints sent no token requests.`,
        source: "Endpoint view, 21 days",
        quote: "",
      },
    ],
    hypotheses: [
      {
        statement:
          "Each delivery thread refreshes an expired token on its own and retries without backoff, so the customer's identity provider rate-limits our client and the endpoint is paused.",
        status: "leading hypothesis",
        supports: ["Seen directly in the ep_harbor_main log.", "Every storm starts at a token expiry during a burst."],
        against_or_gaps: [
          "The customer's identity provider logs are second-hand.",
          "Only two storms have our full logs.",
        ],
      },
      {
        statement:
          "The customers' identity providers revoke tokens early under load, which makes our retries fail. May coexist with the first.",
        status: "alternative hypothesis",
        supports: ["Some retries got 401 with a fresh token.", "Two customers' identity providers rate-limited us."],
        against_or_gaps: ["One active token per client explains the 401s.", "Quiet expiries refresh with one request."],
      },
    ],
    ruled_out: INCIDENT.ruledOut.map((r) => r.split(":")[0]!),
    open_questions: [
      "Should the worker refresh an endpoint's token once, for every thread?",
      "Should a 429 from a token endpoint count toward the pause?",
      "Do other OAuth customers' identity providers keep one active token per client?",
    ],
  };
}

/** Fixed wording: what the lab shows and what it does not. The model's version of this sentence is never used. */
export const HANDOFF_NOTE =
  "The token-refresh storm is reproduced in a lab with a scripted identity provider and endpoint. How each customer's identity provider limits token requests is not confirmed.";
// The reproduction test passes while the bug exists (it asserts the endpoint is paused); the regression test is the
// one that fails when the fix is off. Say exactly that.
export const LAB_TEST_ATTACHMENT = "Lab tests: storm reproduced; regression fails without the fix";

export function ruleHandoff() {
  return {
    title: "Webhook endpoints paused by a token-refresh storm",
    severity: "S2",
    scope: `${INCIDENT.totalTickets} tickets, ${INCIDENT.accounts.length} accounts, OAuth endpoints only, 21 days.`,
    rules_triggered: ["code", "spread", "security", "data"],
    reproduction: [
      "Run the lab's reproduction test with the fix flag off: 32 deliveries meet an expired token on the hour.",
      "It passes by showing the bug: over 100 token requests in a minute, a 429, and the endpoint paused while it is up.",
      "Compare with the ep_harbor_main log: 401s, one token request per thread, retries at once, then the pause.",
      "Ask one affected customer's identity provider admin for their token rate limit and their one-token-per-client setting.",
    ],
    evidence_attached: [
      LAB_TEST_ATTACHMENT,
      "Three delivery log excerpts",
      "21-day endpoint table by auth type",
      "Deliveries in flight per storm",
      `${INCIDENT.totalTickets} linked tickets`,
    ],
    ruled_out: INCIDENT.ruledOut.map((r) => r.split(":")[0]!),
    workaround_in_place:
      "Support replays paused endpoints with RB-14 after a test delivery and keeps the tickets on the incident; a proposed detector flags new storms within 15 minutes.",
    the_ask:
      "Decide how the webhook worker should refresh an expired token once per endpoint, and how deliveries should wait instead of failing when the customer's identity provider rate-limits token requests.",
    hypothesis_note: HANDOFF_NOTE,
  };
}

export function ruleVerify() {
  return {
    verdict: "consistent with hypothesis",
    reading: `Canary storms went from ${c.before.storms} to ${c.after.storms} and token requests from ${c.before.tokenRequests.toLocaleString("en-US")} to ${c.after.tokenRequests.toLocaleString("en-US")}; control storms stayed at ${k.after.storms}. No event was delivered twice and none was lost on the canary.`,
    what_it_does_not_prove: [
      "That real customers' identity providers behave like the lab's.",
      "That it holds beyond 14 days of scripted traffic.",
      "That bursts larger than the lab's are handled.",
    ],
    keep_watching: ["Detector hits on control workspaces.", "Pauses that are real endpoint outages."],
    next_decision:
      "Keep the flag on the canary workspaces for another 14 days; widen only if storms stay at zero and real outages still pause. A lost or doubled event reverses it.",
  };
}

export function ruleKb() {
  return {
    title: "Webhook endpoint paused after a burst of token requests at token expiry",
    applies_when: [
      "Endpoint paused at the top of the hour while the customer's server was up.",
      "Customer's identity provider shows our client rate-limited.",
      "Customer's security team asks about a burst of token requests from us.",
    ],
    how_to_confirm: [
      "Delivery log: 401 on every delivery in flight right after a token expiry.",
      "Delivery log: many token requests within a minute, then 429 from the identity provider.",
      "Endpoint uses OAuth client credentials, not an HMAC signature.",
    ],
    steps: [
      "Confirm the customer's endpoint answers 200 to a test delivery, before RB-14.",
      "Apply RB-14: replay the failed deliveries from the paused window.",
      "Link the ticket to the parent incident and tell the customer the requests were ours.",
      "Note the replayed event range on the ticket so the customer can check for duplicates.",
    ],
    escalate_if: [
      "The endpoint still fails a test delivery.",
      "The endpoint uses an HMAC signature, not OAuth.",
      "The identity provider answers invalid_client.",
      "A security team reports requests from addresses that are not ours.",
    ],
    status_note: `${INCIDENT.change.ref} is on the canary workspaces; until it is on everywhere, new storms still pause endpoints.`,
    related: [...INCIDENT.openIds, "RB-14", INCIDENT.change.ref],
  };
}

export function ruleShiftnote(summary?: ShiftSummary | null) {
  const s = summary ?? {};
  return {
    headline: `Queue started at ${s.open_at_start ?? TICKETS.length}; ${s.approved_for_closure ?? 0} approved for closure by runbook, and the token-refresh storm is with engineering.`,
    done: [
      `${s.approved_for_closure ?? 0} tickets approved for runbook closure.`,
      "Paused-endpoint pattern grouped and contained.",
      "Detector query written; proposed to run every 15 minutes.",
    ],
    // Every item names an owner and a deadline, as the operating model says a handover should.
    needs_you: (s.needs_a_person ?? []).slice(0, 4).map((x) => `${x} Owner: India engineering on-call, by 07:00 ET.`),
    escalated: s.escalated
      ? [`${s.escalated.ref}: ${s.escalated.title}`, "RB-14 meanwhile for newly paused endpoints."]
      : ["Nothing sent to engineering yet."],
    watch: ["Detector candidates for token storms.", "Security questions about our OAuth client."],
  };
}

// The pattern's exceptions apply here too: a ticket outside the pattern is never routed to the runbook.
export function ruleClassify(text: string, article?: { title?: string } | null) {
  const r = ruleTriageFor(RULE_PACK, { id: "NEW", text });
  const exception = r.runbook === "RB-14" || /webhook/i.test(text) ? exceptionIn(EXCEPTIONS, "RB-14", text)?.hit : null;
  const known = r.runbook === "RB-14" && !exception;
  return {
    component: r.component,
    severity: r.severity,
    matches_known_pattern: known,
    matched_article: known ? (article?.title ?? "none") : "none",
    suggested_action: known
      ? "Confirm a test delivery answers 200, then apply RB-14, link the ticket to the parent incident and note the replayed range."
      : exception
        ? "Outside the known pattern: send to engineering with the delivery logs."
        : "A person reviews it.",
    confirm: known
      ? "Before RB-14, a person checks the endpoint answers 200 to a test delivery. The check above reads wording only."
      : "",
    escalate: Boolean(exception),
    why: exception ? `Rules: the ticket says "${exception}", an exception in the article.` : r.reason,
  };
}
