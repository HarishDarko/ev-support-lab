import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "desk-theme";

const systemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** The theme in force: an explicit data-theme if set, otherwise the system setting. */
function resolve(): Theme {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : systemTheme();
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(resolve);

  // Follow the system while the visitor has not chosen.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(systemTheme());
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = resolve() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
  }, []);

  return { theme, toggle };
}
