// Deterministic fallback for every step. Used when a live call fails, is rate limited,
// or returns output that fails validation. Built only from the synthetic data, so it never invents anything.
// The engine is in rule-engine.ts and the content in the pack; these are the default pack's rules.
import { DEFAULT_COMPONENT, RULES, RUNBOOKS, RUNBOOK_EXCEPTIONS } from "../../shared/packs/default";
import { ruleTriageFor, rulePatternsFor, type TriageTicket } from "./rule-engine";
import { DEFAULT_PACK } from "../../shared/packs";

export type { Severity, TriageAction, ShiftSummary } from "../../shared/packs/types";
export type { RuleTriageResult, TriageTicket } from "./rule-engine";
export {
  HANDOFF_NOTE,
  LAB_TEST_ATTACHMENT,
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleVerify,
} from "../../shared/packs/default";

const TRIAGE_RULES = { rules: RULES, runbookExceptions: RUNBOOK_EXCEPTIONS, defaultComponent: DEFAULT_COMPONENT };

export const ruleTriage = (ticket: TriageTicket) => ruleTriageFor(TRIAGE_RULES, ticket);
export const rulePatterns = () => rulePatternsFor(DEFAULT_PACK);

export const RUNBOOK_IDS: Set<string> = new Set(RUNBOOKS.map((r) => r.id));
