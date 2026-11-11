// Which industry the desk shows. The site opens on a choice of the industries; a `?pack=<id>` link goes straight to
// that one, and any other address (an old link, an unknown or hostile value) lands on the choice. Only complete packs
// (synthetic data, keyword rules and reviewed labels) with their incident walkthrough can be picked.
import type { PackId } from "../../shared/packs";
import { CATALOG, CATALOG_DEFAULT_ID as DEFAULT_PACK_ID } from "../../shared/packs/catalog";

export interface IndustryOption {
  id: PackId;
  name: string;
}

/** The industries on offer: complete packs with their incident walkthrough, in the registry's order. */
export const INDUSTRY_OPTIONS: readonly IndustryOption[] = (Object.keys(CATALOG) as PackId[])
  .filter((id) => CATALOG[id].complete === true && CATALOG[id].hasIncident === true)
  .map((id) => ({ id, name: CATALOG[id].name }));

// The options come from the registry, so an offered id is a known pack.
const offered = (id: unknown, options: readonly IndustryOption[]): id is PackId =>
  typeof id === "string" && options.some((o) => o.id === id);

/** The industry a `?pack=` link names, or null when the page should open on the choice of industries. */
export function resolveIndustry(search: string, options: readonly IndustryOption[] = INDUSTRY_OPTIONS): PackId | null {
  const linked = new URLSearchParams(search).get("pack");
  return offered(linked, options) ? linked : null;
}

/** The query string with the industry set, keeping the other parameters (such as a `?desk=` tab). */
export function withIndustry(search: string, id: PackId): string {
  const params = new URLSearchParams(search);
  params.set("pack", id);
  return `?${params.toString()}`;
}

/** The label a pack gives one of its ticket fields, or the fallback when it does not name it. */
export function fieldLabel(id: PackId, key: string, fallback: string): string {
  const fields: readonly { key: string; label: string }[] = CATALOG[id].fields ?? [];
  return fields.find((f) => f.key === key)?.label ?? fallback;
}

export const industryName = (id: PackId): string => CATALOG[id].name;
export { DEFAULT_PACK_ID };
