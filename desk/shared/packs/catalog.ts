// Every pack's name and labels, for the browser: the Industry menu and the queue read this, not the packs
// themselves, so the page does not carry prompts or rules it never uses.
import type { PackId } from ".";
import { META as EV } from "./ev-charging/meta";

export interface PackMeta {
  id: string;
  name: string;
  complete?: boolean;
  hasIncident?: boolean;
  fields?: readonly { key: string; label: string }[];
}

export const CATALOG = { "ev-charging": EV } satisfies Record<PackId, PackMeta>;
export const CATALOG_DEFAULT_ID: PackId = "ev-charging";
