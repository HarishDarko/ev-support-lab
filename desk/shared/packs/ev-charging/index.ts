// The EV charging pack: an internal support desk for a network of public chargers, with the stuck-session incident.
// Everything in this folder is synthetic data made up for a prototype.
import type { Pack } from "../types";
import {
  COMPONENTS,
  ENGINEERING_CHANGE,
  HERO,
  HISTORY,
  RUNBOOKS,
  TICKETS,
  type Component,
  type HistoryItem,
  type Ticket,
} from "./data";
import { COMPONENT_TERMS, RUNBOOK_EXCEPTIONS, RUNBOOK_FITS, RUNBOOK_TERMS } from "./guardrails";
import {
  ACTION_GUIDE,
  BILLING_STEP,
  COMPONENT_GUIDE,
  CONFIRM_METER,
  METER_STEP,
  SEVERITY_GUIDE,
  SYSTEM,
  historyLine,
  ticketLine,
} from "./prompts";
import { DEFAULT_COMPONENT, RULES } from "./triage-rules";

export const EV_CHARGING = {
  id: "ev-charging",
  name: "EV charging",
  components: COMPONENTS,
  defaultComponent: DEFAULT_COMPONENT,
  runbooks: RUNBOOKS,
  tickets: TICKETS,
  history: HISTORY,
  extraIds: [ENGINEERING_CHANGE.ref, HERO.incidentId],
  rules: RULES,
  componentTerms: COMPONENT_TERMS,
  runbookTerms: RUNBOOK_TERMS,
  runbookFits: RUNBOOK_FITS,
  runbookExceptions: RUNBOOK_EXCEPTIONS,
  prompts: {
    system: SYSTEM,
    severityGuide: SEVERITY_GUIDE,
    componentGuide: COMPONENT_GUIDE,
    actionGuide: ACTION_GUIDE,
    ticketLine,
    historyLine,
  },
  /** The fixed steps around the record-only runbook: confirm first, then a person reviews the bill. */
  recordOnly: { runbook: "RB-05", confirmStep: METER_STEP, reviewStep: BILLING_STEP, confirmNote: CONFIRM_METER },
} satisfies Pack<Component, Ticket, HistoryItem> & Record<string, unknown>;
