// The e-commerce desk: its queue, rules, recorded run and incident, in the shapes the run model and the incident
// screens read. Loaded only when e-commerce is picked, so the EV page carries none of it.
import labelsJson from "../../../docs/eval/reference-labels.e-commerce.json";
import { ruleTriageFor } from "../../functions/_lib/rule-engine";
import { E_COMMERCE } from "../../shared/packs/e-commerce";
import {
  ruleClassify,
  ruleHandoff,
  ruleInvestigate,
  ruleKb,
  ruleShiftnote,
  ruleVerify,
} from "../../shared/packs/e-commerce/fallbacks";
import type { ShopTicket } from "../../shared/packs/e-commerce/data";
import recordedJson from "../data/recorded-run.e-commerce.json";
import { SHOP_INCIDENT } from "../incident/e-commerce";
import { parseRecordedRun, runFromRecording } from "../run/parse";
import type { DeskPack, DeskTicket } from "../run/pack";
import type { Run } from "../run/types";
import { fieldLabel } from "./industry";
import type { PackBundle } from "./bundles";

const shop = (t: DeskTicket) => t as unknown as ShopTicket;
const dash = (v: string) => (v === "-" ? "–" : v);
const ids = E_COMMERCE.tickets.map((t) => t.id);

let recorded: Run | undefined;

export const SHOP_DESK: DeskPack = {
  id: "e-commerce",
  tickets: E_COMMERCE.tickets,
  history: E_COMMERCE.history,
  runbooks: E_COMMERCE.runbooks,
  newTicketExample: E_COMMERCE.newTicketExample,
  requestPack: "e-commerce",
  // Live calls turn on once the committed recording is an AI one; today it is the rules' answers (MOCK=1, no model).
  liveRuns: recordedJson.source === "ai",
  recorded: () => (recorded ??= runFromRecording(parseRecordedRun(recordedJson, ids))),
  ruleTriage: (t) => ruleTriageFor(E_COMMERCE, t),
  ruleClassify,
  fallbacks: {
    investigate: ruleInvestigate,
    handoff: ruleHandoff,
    verify: ruleVerify,
    kb: ruleKb,
    shiftnote: ruleShiftnote,
  },
  placeOf: (h) => (h as unknown as { order: string }).order,
  placeWord: "orders",
  columns: [
    { label: fieldLabel("e-commerce", "order", "Order"), value: (t) => dash(shop(t).order) },
    { label: fieldLabel("e-commerce", "channel", "Channel"), value: (t) => dash(shop(t).channel) },
  ],
  facts: (t) => {
    const { order, channel } = shop(t);
    return [
      ...(order === "-" ? [] : [{ label: fieldLabel("e-commerce", "order", "Order"), value: order, mono: true }]),
      ...(channel === "-" ? [] : [{ label: fieldLabel("e-commerce", "channel", "Channel"), value: channel }]),
    ];
  },
  heldNote: "why the second authorization was made",
  checkScope: {
    classify: {
      checked: "the article title is real, the wording of two named exceptions to the pattern",
      notChecked:
        "whether the processor shows one capture (a person checks before RB-21), severity, anything else in the article",
    },
  },
  gate: {
    why: (runbook) =>
      `${runbook} releases the hold and voids the extra authorization, so a person checks that the payment processor shows exactly one capture for the order before it runs.`,
    label: "I checked: the processor shows one capture for this order",
    pending: "Not approvable until the capture is checked.",
  },
  labels: {
    labels: labelsJson.labels,
    reviewed: labelsJson.reviewed,
    path: "docs/eval/reference-labels.e-commerce.json",
    handDecided: true,
  },
};

export const SHOP_BUNDLE: PackBundle = { desk: SHOP_DESK, incident: SHOP_INCIDENT };
