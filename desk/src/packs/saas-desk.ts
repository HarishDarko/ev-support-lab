// The SaaS support desk: its queue, rules, recorded run and incident, in the shapes the run model and the incident
// screens read. Loaded only when SaaS support is picked, so the EV page carries none of it.
import labelsJson from "../../../docs/eval/reference-labels.saas-support.json";
import { ruleTriageFor } from "../../functions/_lib/rule-engine";
import { SAAS_SUPPORT } from "../../shared/packs/saas-support";
import {
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleVerify,
} from "../../shared/packs/saas-support/fallbacks";
import type { SaasTicket } from "../../shared/packs/saas-support/data";
import recordedJson from "../data/recorded-run.saas-support.json";
import { SAAS_INCIDENT } from "../incident/saas-support";
import { parseRecordedRun, runFromRecording } from "../run/parse";
import type { DeskPack, DeskTicket } from "../run/pack";
import type { Run } from "../run/types";
import { fieldLabel } from "./industry";
import type { PackBundle } from "./bundles";

const saas = (t: DeskTicket) => t as unknown as SaasTicket;
const dash = (v: string) => (v === "-" ? "–" : v);
const ids = SAAS_SUPPORT.tickets.map((t) => t.id);

let recorded: Run | undefined;

export const SAAS_DESK: DeskPack = {
  id: "saas-support",
  tickets: SAAS_SUPPORT.tickets,
  history: SAAS_SUPPORT.history,
  runbooks: SAAS_SUPPORT.runbooks,
  newTicketExample: SAAS_SUPPORT.newTicketExample,
  requestPack: "saas-support",
  // Live calls turn on once the committed recording is an AI one; today it is the rules' answers (MOCK=1, no model).
  liveRuns: recordedJson.source === "ai",
  recorded: () => (recorded ??= runFromRecording(parseRecordedRun(recordedJson, ids))),
  ruleTriage: (t) => ruleTriageFor(SAAS_SUPPORT, t),
  ruleClassify,
  fallbacks: {
    investigate: ruleInvestigate,
    handoff: ruleHandoff,
    verify: ruleVerify,
    kb: ruleKb,
    shiftnote: ruleShiftnote,
  },
  placeOf: (h) => (h as unknown as { account: string }).account,
  placeWord: "accounts",
  columns: [
    { label: fieldLabel("saas-support", "account", "Account"), value: (t) => dash(saas(t).account) },
    { label: fieldLabel("saas-support", "plan", "Plan"), value: (t) => dash(saas(t).plan) },
  ],
  facts: (t) => {
    const { account, plan } = saas(t);
    return account === "-"
      ? []
      : [
          { label: fieldLabel("saas-support", "account", "Account"), value: account },
          { label: fieldLabel("saas-support", "plan", "Plan"), value: plan },
        ];
  },
  heldNote: "why the endpoint was paused",
  checkScope: {
    classify: {
      checked: "the article title is real, the wording of two named exceptions to the pattern",
      notChecked:
        "whether the endpoint answers a test delivery (a person checks before RB-14), severity, anything else in the article",
    },
  },
  gate: {
    why: (runbook) =>
      `${runbook} replays the failed deliveries and marks them delivered, so a person checks that the endpoint answers 200 to a test delivery before it runs.`,
    label: "I checked: the endpoint answers 200 to a test delivery",
    pending: "Not approvable until the test delivery is checked.",
  },
  labels: {
    labels: labelsJson.labels,
    reviewed: labelsJson.reviewed,
    path: "docs/eval/reference-labels.saas-support.json",
    handDecided: false,
  },
};

export const SAAS_BUNDLE: PackBundle = { desk: SAAS_DESK, incident: SAAS_INCIDENT };
