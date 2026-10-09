import { motion } from "motion/react";
import { STAGES } from "../stages";
import { META } from "../data/synthetic";
import type { Theme } from "../theme";

export type Page = "walkthrough" | "operating" | "notes";
const PAGES: { id: Exclude<Page, "walkthrough">; name: string }[] = [
  { id: "operating", name: "How I'd run it" },
  { id: "notes", name: "Engineering notes" },
];
import "./TopStrip.css";

interface Props {
  stageIndex: number;
  onStage: (index: number) => void;
  theme: Theme;
  onToggleTheme: () => void;
  /** Where the AI answers come from: the recorded run, or this visit's live calls and their cost. */
  aiLabel: string;
  onAi: () => void;
  page: Page;
  onPage: (page: Page) => void;
}

/** The 52 px top strip: name, stage nav, synthetic-data label, where the AI answers come from, theme toggle. */
export function TopStrip({ stageIndex, onStage, theme, onToggleTheme, aiLabel, onAi, page, onPage }: Props) {
  return (
    <header className="strip">
      <span className="strip-name">Support Desk</span>
      <nav className="strip-nav" aria-label="Walkthrough and pages">
        <ol>
          {STAGES.map((stage, i) => (
            <li key={stage.id}>
              <button
                type="button"
                className="strip-stage"
                aria-current={page === "walkthrough" && i === stageIndex ? "step" : undefined}
                onClick={() => onStage(i)}
              >
                <span className="strip-stage-num" aria-hidden="true">
                  {i + 1}
                </span>
                {stage.name}
                {page === "walkthrough" && i === stageIndex && (
                  <motion.span layoutId="stage-mark" className="strip-mark" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
          {PAGES.map((p, i) => (
            <li key={p.id} className={i === 0 ? "strip-sep" : undefined}>
              <button
                type="button"
                className="strip-stage"
                aria-current={page === p.id ? "page" : undefined}
                onClick={() => onPage(p.id)}
              >
                {p.name}
                {page === p.id && <motion.span layoutId="stage-mark" className="strip-mark" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="strip-end">
        <button type="button" className="strip-ai" onClick={onAi} title="Cost and provenance in the desk">
          {aiLabel}
        </button>
        <span className="strip-synthetic" data-testid="synthetic-label">
          {META.label}
        </span>
        <button
          type="button"
          className="strip-theme"
          aria-label="Dark mode"
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="theme-toggle"
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}

// The button shows what a click switches to: a moon in light mode, a sun in dark mode.
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path
      d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
