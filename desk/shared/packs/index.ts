// The industry packs the desk can run. A request names one by id; no id means the default pack, so the recorded
// run and older clients keep working unchanged.
import { E_COMMERCE } from "./e-commerce";
import { EV_CHARGING } from "./ev-charging";
import { SAAS_SUPPORT } from "./saas-support";

export const PACKS = { "ev-charging": EV_CHARGING, "saas-support": SAAS_SUPPORT, "e-commerce": E_COMMERCE } as const;
export type PackId = keyof typeof PACKS;

export const DEFAULT_PACK = EV_CHARGING;
export const DEFAULT_PACK_ID = "ev-charging" satisfies PackId;

export const isPackId = (id: unknown): id is PackId => typeof id === "string" && Object.hasOwn(PACKS, id);

export type { Pack } from "./types";
