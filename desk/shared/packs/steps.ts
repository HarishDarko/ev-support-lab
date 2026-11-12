// Server side: each pack's incident steps (investigate, handoff, verify, KB, shift note, new-ticket check).
// Kept apart from ./index.ts so the browser bundle never carries these prompts.
import type { Step } from "../../functions/_lib/kit";
import type { PackId } from ".";
import { INCIDENT_STEPS as SHOP, SOURCES as SHOP_SOURCES } from "./e-commerce/steps";
import { INCIDENT_STEPS as EV, SOURCES as EV_SOURCES } from "./ev-charging/steps";
import { INCIDENT_STEPS as SAAS, SOURCES as SAAS_SOURCES } from "./saas-support/steps";

/** The steps every incident pack supplies, each a real step the handler can run. */
export type IncidentStepName = "investigate" | "handoff" | "verify" | "kb" | "shiftnote" | "classify";

// `satisfies` checks each pack's own steps against Step, so the type checker covers every pack, not only the
// default one.
export const INCIDENT_STEPS = { "ev-charging": EV, "saas-support": SAAS, "e-commerce": SHOP } satisfies Partial<
  Record<PackId, Record<IncidentStepName, Step>>
>;
export type IncidentPackId = keyof typeof INCIDENT_STEPS;
/** Named sources an evidence point may cite, per pack. */
export const INCIDENT_SOURCES = {
  "ev-charging": EV_SOURCES,
  "saas-support": SAAS_SOURCES,
  "e-commerce": SHOP_SOURCES,
} satisfies Record<IncidentPackId, Record<string, string>>;

export type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  ShiftnoteModel,
  VerifyModel,
} from "./ev-charging/steps";
