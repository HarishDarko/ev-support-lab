// EV charging pack: the wording its prompts use, and the fixed steps around its record-only runbook (RB-05).
import { SITES, type HistoryItem, type Ticket } from "./data";

export const SYSTEM = `You work inside an internal production-support desk for an EV charging network operator. The support desk serves internal teams (customer care, NOC, field service, host accounts, billing ops), not drivers directly.

Everything you are given is synthetic data made up for a prototype.

Rules:
- Never invent names of people. Refer to roles only (driver, host, customer care, NOC, field service, engineering).
- Never invent business figures such as revenue, cost, savings or customer counts. Use only numbers present in the input.
- Use only facts in the input. If something is not in the input, say it is unknown.
- A pattern across tickets is a correlation. State causes as hypotheses, never as proven.
- Write plainly and briefly, the way an experienced support engineer writes for colleagues. No marketing language, no lecturing.`;

export const SEVERITY_GUIDE = `Severity: S1 network-wide outage or safety. S2 billing or session-data correctness, or impact across several sites. S3 one site or charger degraded. S4 question, request or cosmetic.`;
/** The triage prompt's notes on components and on actions. */
export const COMPONENT_GUIDE =
  "the best fit for what the ticket literally describes. connectivity: offline, heartbeat or connection loss. hardware-field: physical damage, parts or derating. pricing: how prices or rates work. request-or-question: plain questions and requests, including firmware schedules.";
export const ACTION_GUIDE =
  "close_with_runbook only if one of the runbooks below fully resolves it without code, firmware or config changes; escalation_candidate if it likely needs engineering; info_only for alerts that already cleared or plain questions you can answer; otherwise needs_human";
export const ticketLine = (t: Ticket) =>
  `${t.id} | opened ${t.opened} ET | from ${t.from} | site ${t.site}${SITES[t.site] ? ` (${SITES[t.site]})` : ""} | charger ${t.charger} | firmware ${t.fw} | ${t.text}`;
export const historyLine = (h: HistoryItem) =>
  `${h.id} | day ${h.day} | site ${h.site} | firmware ${h.fw} | ${h.text} | resolution: ${h.resolution}`;
// The fixed steps around RB-05, the record-only runbook. The meter check always comes first.
export const METER_STEP = "Confirm the meter shows no energy change since unplug, before RB-05.";
// The billing step is fixed too: a corrected session changes what the driver pays, so a person always reviews it.
export const BILLING_STEP = "Flag the invoice for billing review and link the ticket to the parent incident.";
export const CONFIRM_METER =
  "Before RB-05, a person checks the meter shows no energy change since unplug. The check above reads wording only.";
