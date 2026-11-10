// The default pack's deterministic fallbacks, where the UI and the tests import them from. The rules engine is in
// rule-engine.ts and the rules themselves are in the pack (shared/packs/), built only from its synthetic data.
import { RUNBOOKS, TRIAGE_RULES } from "../../shared/packs/default";
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

export const ruleTriage = (ticket: TriageTicket) => ruleTriageFor(TRIAGE_RULES, ticket);
export const rulePatterns = () => rulePatternsFor(DEFAULT_PACK);

export const RUNBOOK_IDS: Set<string> = new Set(RUNBOOKS.map((r) => r.id));
