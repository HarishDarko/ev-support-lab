// The picked industry for this visit, kept in the address (`?pack=`), so a reload or a shared link opens the same
// one. With no industry in the address the site shows the choice of industries. Leaving the chooser, or going back
// to it, is a step in the browser's history, so Back returns; switching with the Industry menu is not.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

const setSearch = (search: string, step: "push" | "replace") => {
  const url = `${window.location.pathname}${search}${window.location.hash}`;
  if (step === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(window.history.state, "", url);
};

/** The browser kept an earlier pick here; the address holds the pick now. */
const OLD_STORAGE_KEY = "support-desk:industry";

/**
 * The industry in the address, or null for the choice. `pick` from the chooser and `choose` add a history step;
 * `pick` from the Industry menu replaces the current one.
 */
export function useIndustryChoice(): {
  id: PackId | null;
  pick: (id: PackId, step?: "push" | "replace") => void;
  choose: () => void;
} {
  const [id, setId] = useState<PackId | null>(() => resolveIndustry(window.location.search));
  useEffect(() => {
    try {
      window.localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      // Storage can be blocked; nothing to tidy then.
    }
    const onPop = () => setId(resolveIndustry(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const pick = useCallback((next: PackId, step: "push" | "replace" = "replace") => {
    setId(next);
    setSearch(withIndustry(window.location.search, next), step);
  }, []);
  const choose = useCallback(() => {
    setId(null);
    // A desk link has done its job by now; picking again starts a plain walkthrough.
    const params = new URLSearchParams(window.location.search);
    params.delete("pack");
    params.delete("desk");
    const text = params.toString();
    setSearch(text ? `?${text}` : "", "push");
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
