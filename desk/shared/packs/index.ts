// The industry packs the desk can run. A request names one by id; no id means the default pack, so the recorded
// run and older clients keep working unchanged.
import { EV_CHARGING } from "./ev-charging";

export const PACKS = { "ev-charging": EV_CHARGING } as const;
export type PackId = keyof typeof PACKS;

export const DEFAULT_PACK = EV_CHARGING;
export const DEFAULT_PACK_ID: PackId = "ev-charging";

export const isPackId = (id: unknown): id is PackId => typeof id === "string" && Object.hasOwn(PACKS, id);

export type { Pack } from "./types";
