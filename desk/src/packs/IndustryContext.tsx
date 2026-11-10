// The picked industry for this visit, kept in the address (`?pack=`) and in this browser, so a reload or a shared
// link opens the same one. Storage can be unavailable (private windows); then the pick lasts for this visit only.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PackId } from "../../shared/packs";
import { INDUSTRY_OPTIONS, STORAGE_KEY, resolveIndustry, withIndustry, type IndustryOption } from "./industry";

export interface IndustryApi {
  id: PackId;
  options: readonly IndustryOption[];
  pick: (id: PackId) => void;
}

const IndustryContext = createContext<IndustryApi | null>(null);

function stored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function IndustryProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<PackId>(() => resolveIndustry(window.location.search, stored()));
  const pick = useCallback((next: PackId) => {
    setId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The pick still applies to this visit.
    }
    const url = `${window.location.pathname}${withIndustry(window.location.search, next)}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const api = useMemo(() => ({ id, options: INDUSTRY_OPTIONS, pick }), [id, pick]);
  return <IndustryContext.Provider value={api}>{children}</IndustryContext.Provider>;
}

export function useIndustry(): IndustryApi {
  const api = useContext(IndustryContext);
  if (!api) throw new Error("useIndustry needs an IndustryProvider");
  return api;
}
