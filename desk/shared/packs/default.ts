// The default pack's parts, by name, for the modules the browser also loads (functions/_lib/rules.ts). Named
// re-exports let the bundler drop what the page never uses; reading them off the pack object would keep it all.
// tests/packs.test.ts checks these are the default pack's own.
export { DEFAULT_COMPONENT, RULES, TRIAGE_RULES } from "./ev-charging/triage-rules";
export { RUNBOOK_EXCEPTIONS } from "./ev-charging/guardrails";
export { RUNBOOKS } from "./ev-charging/data";
export {
  HANDOFF_NOTE,
  LAB_TEST_ATTACHMENT,
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleVerify,
} from "./ev-charging/fallbacks";
