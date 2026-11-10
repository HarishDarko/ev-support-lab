// What an industry pack gives the desk: its synthetic queue and history, runbooks, keyword rules, guardrail word
// lists, runbook exceptions and the wording its prompts use. The engine (functions/_lib) reads only this shape, so a
// new industry is a new folder under shared/packs/, not edits across the engine.

export type Severity = "S1" | "S2" | "S3" | "S4";
export type TriageAction = "close_with_runbook" | "needs_human" | "escalation_candidate" | "info_only";

/** The ticket fields the engine reads. A pack's own ticket type adds its fields (and its prompts format them). */
export interface PackTicket {
  id: string;
  text: string;
  fw?: string;
}

/** A closed ticket. Its resolution starts with the runbook id when a runbook resolved it. */
export interface PackHistoryItem {
  id: string;
  text: string;
  fw: string;
  resolution: string;
}

export interface PackRunbook {
  id: string;
  title: string;
  scope: string;
  /** The runbook corrects records and does not fix the cause. */
  recordOnly?: boolean;
}

/** One keyword rule of the deterministic triage fallback. The first rule whose pattern matches decides. */
export interface TriageRule<C extends string = string> {
  re: RegExp;
  component: C;
  severity: Severity;
  action: TriageAction;
  runbook: string;
  why: string;
}

/** A named reason a runbook closure is not allowed for a ticket. Returns the words that triggered it. */
export interface RunbookExceptionRule {
  name: string;
  test: (text: string, fw?: string) => string | null | undefined;
}

/** The shift summary the client sends to the end-of-shift note. Client-supplied, so every field is optional. */
export interface ShiftSummary {
  open_at_start?: number;
  approved_for_closure?: number;
  needs_a_person?: string[];
  escalated?: { ref: string; title: string };
}

export interface Pack<
  C extends string = string,
  T extends PackTicket = PackTicket,
  H extends PackHistoryItem = PackHistoryItem,
> {
  id: string;
  name: string;
  /** Shown in the Industry menu only when complete: synthetic data, keyword rules and reviewed labels. */
  complete?: boolean;
  /** The pack's labels for the queue's ticket fields (for EV: site, charger, firmware). */
  fields?: { key: string; label: string }[];
  /** Live model calls are allowed for this pack. Off until the pack has a reviewed recording (SD-14). */
  liveRuns?: boolean;
  /** The pack has a step-by-step incident walkthrough (logs, handoff, verification). */
  hasIncident?: boolean;
  /** The ticket the new-ticket check starts from. */
  newTicketExample?: string;
  components: readonly C[];
  /** The label for plain questions and requests, and for any ticket no rule matches. */
  defaultComponent: C;
  runbooks: PackRunbook[];
  tickets: T[];
  history: H[];
  /** Ids the steps may cite beyond tickets, history and runbooks (for example an incident or a change). */
  extraIds: string[];
  rules: TriageRule<C>[];
  /** What each label must be about: a label whose words never appear in the ticket is rejected. */
  componentTerms: Record<string, string[]>;
  /** What the ticket must mention for a runbook to apply at all. */
  runbookTerms: Record<string, string[]>;
  /** The labels each runbook may be used for. */
  runbookFits: Record<string, string[]>;
  runbookExceptions: Record<string, RunbookExceptionRule[]>;
  /** The fixed steps around the pack's record-only runbook, if it has one: a check before it, a review after it. */
  recordOnly?: { runbook: string; confirmStep: string; reviewStep: string; confirmNote: string };
  prompts: {
    /** The system prompt for every call. */
    system: string;
    severityGuide: string;
    /** The triage prompt's notes on components and actions. */
    componentGuide: string;
    actionGuide: string;
    ticketLine: (t: T) => string;
    historyLine: (h: H) => string;
  };
}
