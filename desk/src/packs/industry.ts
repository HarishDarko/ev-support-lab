// Which industry the desk shows. A `?pack=<id>` link wins, then the visitor's last pick, then the default.
// Only complete packs (synthetic data, keyword rules and reviewed labels) with their incident walkthrough can be
// picked; anything else falls back.
import type { PackId } from "../../shared/packs";
import { CATALOG, CATALOG_DEFAULT_ID as DEFAULT_PACK_ID } from "../../shared/packs/catalog";

export interface IndustryOption {
  id: PackId;
  name: string;
}

/** The industries the menu offers: complete packs with their incident walkthrough, the default first. */
export const INDUSTRY_OPTIONS: readonly IndustryOption[] = (Object.keys(CATALOG) as PackId[])
  .filter((id) => CATALOG[id].complete === true && CATALOG[id].hasIncident === true)
  .sort((a, b) => Number(b === DEFAULT_PACK_ID) - Number(a === DEFAULT_PACK_ID))
  .map((id) => ({ id, name: CATALOG[id].name }));

export const STORAGE_KEY = "support-desk:industry";

// The options come from the registry, so an offered id is a known pack.
const offered = (id: unknown, options: readonly IndustryOption[]): id is PackId =>
  typeof id === "string" && options.some((o) => o.id === id);

/** The industry to show, from the page's query string and the stored pick. */
export function resolveIndustry(
  search: string,
  stored: string | null,
  options: readonly IndustryOption[] = INDUSTRY_OPTIONS,
): PackId {
  const linked = new URLSearchParams(search).get("pack");
  if (offered(linked, options)) return linked;
  if (offered(stored, options)) return stored;
  return DEFAULT_PACK_ID;
}

/** The query string with the industry set: the default pack leaves no `pack` parameter, so old links stay the same. */
export function withIndustry(search: string, id: PackId): string {
  const params = new URLSearchParams(search);
  if (id === DEFAULT_PACK_ID) params.delete("pack");
  else params.set("pack", id);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The label a pack gives one of its ticket fields, or the fallback when it does not name it. */
export function fieldLabel(id: PackId, key: string, fallback: string): string {
  const fields: readonly { key: string; label: string }[] = CATALOG[id].fields ?? [];
  return fields.find((f) => f.key === key)?.label ?? fallback;
}

export const industryName = (id: PackId): string => CATALOG[id].name;
export { DEFAULT_PACK_ID };
