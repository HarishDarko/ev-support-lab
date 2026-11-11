// The picked industry for this visit, kept in the address (`?pack=`), so a reload or a shared link opens the same
// one. With no industry in the address the site shows the choice of industries.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PackId } from "../../shared/packs";
import { INDUSTRY_OPTIONS, resolveIndustry, withIndustry, type IndustryOption } from "./industry";

export interface IndustryApi {
  id: PackId;
  options: readonly IndustryOption[];
  pick: (id: PackId) => void;
  /** Back to the choice of industries. */
  choose: () => void;
}

const IndustryContext = createContext<IndustryApi | null>(null);

const replaceSearch = (search: string) =>
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);

/** The industry in the address, or null for the choice; picking one puts it in the address. */
export function useIndustryChoice(): { id: PackId | null; pick: (id: PackId) => void; choose: () => void } {
  const [id, setId] = useState<PackId | null>(() => resolveIndustry(window.location.search));
  const pick = useCallback((next: PackId) => {
    setId(next);
    replaceSearch(withIndustry(window.location.search, next));
  }, []);
  const choose = useCallback(() => {
    setId(null);
    // A desk link has done its job by now; picking again starts a plain walkthrough.
    const params = new URLSearchParams(window.location.search);
    params.delete("pack");
    params.delete("desk");
    const text = params.toString();
    replaceSearch(text ? `?${text}` : "");
  }, []);
  return { id, pick, choose };
}

export function IndustryProvider({
  id,
  pick,
  choose,
  children,
}: {
  id: PackId;
  pick: (id: PackId) => void;
  choose: () => void;
  children: ReactNode;
}) {
  const api = useMemo(() => ({ id, options: INDUSTRY_OPTIONS, pick, choose }), [id, pick, choose]);
  return <IndustryContext.Provider value={api}>{children}</IndustryContext.Provider>;
}

export function useIndustry(): IndustryApi {
  const api = useContext(IndustryContext);
  if (!api) throw new Error("useIndustry needs an IndustryProvider");
  return api;
}
