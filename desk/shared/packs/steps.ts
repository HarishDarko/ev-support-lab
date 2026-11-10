// Server side: each pack's incident steps (investigate, handoff, verify, KB, shift note, new-ticket check).
// Kept apart from ./index.ts so the browser bundle never carries these prompts.
import type { PackId } from ".";
import { INCIDENT_STEPS as EV, SOURCES as EV_SOURCES } from "./ev-charging/steps";

export const INCIDENT_STEPS = { "ev-charging": EV } satisfies Partial<Record<PackId, unknown>>;
export type IncidentPackId = keyof typeof INCIDENT_STEPS;
/** Named sources an evidence point may cite, per pack. */
export const INCIDENT_SOURCES = { "ev-charging": EV_SOURCES } satisfies Record<IncidentPackId, Record<string, string>>;

export type {
  ClassifyModel,
  HandoffModel,
  InvestigationModel,
  KbModel,
  ShiftnoteModel,
  VerifyModel,
} from "./ev-charging/steps";
