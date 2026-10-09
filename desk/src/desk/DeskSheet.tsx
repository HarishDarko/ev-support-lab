import { useRef, type ComponentType, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { META } from "../data/synthetic";
import { useRun } from "../run";
import { CoverageTab } from "./coverage/CoverageTab";
import { HandoffTab } from "./handoff/HandoffTab";
import { IncidentTab } from "./incident/IncidentTab";
import { KnowledgeBaseTab } from "./kb/KnowledgeBaseTab";
import { QueueTab } from "./queue/QueueTab";
import { ScorecardTab } from "./scorecard/ScorecardTab";
import { DESK_TABS, type DeskTab } from "./tabs";
import { useDialog } from "./useDialog";
import { DeskTicket } from "./focus";
import "./DeskSheet.css";

export type { DeskTab } from "./tabs";

export interface DeskSheetProps {
  open: boolean;
  tab: DeskTab;
  onClose: () => void;
  onTab: (tab: DeskTab) => void;
  /** Opens the queue on this ticket. */
  ticket?: string | null;
}

const PANELS: Record<DeskTab, ComponentType> = {
  queue: QueueTab,
  incident: IncidentTab,
  handoff: HandoffTab,
  kb: KnowledgeBaseTab,
  coverage: CoverageTab,
  scorecard: ScorecardTab,
};

// 250 ms with the direction's ease. Under reduced motion the sheet crossfades instead of sliding.
const TRANSITION = { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } as const;

/**
 * The desk: a right-hand sheet with six tabs. Esc closes it, focus is trapped while it is open and returns to
 * whatever opened it. Under 1000 px it fills the screen.
 */
export function DeskSheet(props: DeskSheetProps) {
  return createPortal(
    <AnimatePresence>{props.open && <Sheet key="desk" {...props} />}</AnimatePresence>,
    document.body,
  );
}

function Sheet({ tab, onClose, onTab, ticket = null }: DeskSheetProps) {
  const { label } = useRun();
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const dialog = useRef<HTMLElement>(null);
  const tabButtons = useRef<Partial<Record<DeskTab, HTMLButtonElement | null>>>({});
  const { onKeyDown } = useDialog({ dialog, onClose, present });
  const Panel = PANELS[tab];

  // Arrow keys move between tabs (roving tabindex); Home and End jump to the ends.
  const onTabKeyDown = (event: KeyboardEvent) => {
    const at = DESK_TABS.findIndex((t) => t.id === tab);
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % DESK_TABS.length
        : event.key === "ArrowLeft"
          ? (at - 1 + DESK_TABS.length) % DESK_TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? DESK_TABS.length - 1
              : -1;
    const next = DESK_TABS[to];
    if (!next) return;
    event.preventDefault();
    onTab(next.id);
    tabButtons.current[next.id]?.focus();
  };

  const slide = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } };

  return (
    <>
      <motion.div
        className="desk-scrim"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={TRANSITION}
        onClick={onClose}
      />
      <motion.aside
        ref={dialog}
        className="desk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-title"
        tabIndex={-1}
        data-testid="desk-sheet"
        {...slide}
        transition={TRANSITION}
        onKeyDown={onKeyDown}
      >
        <header className="desk-head">
          <div>
            <h2 id="desk-title" className="desk-title">
              The desk
            </h2>
            <p className="desk-sub">
              <span data-testid="desk-synthetic">{META.label}</span>
              <span aria-hidden="true"> · </span>
              <span>{label}</span>
            </p>
          </div>
          <button type="button" className="dk-button desk-close" onClick={onClose}>
            Close
            <span className="desk-key" aria-hidden="true">
              Esc
            </span>
          </button>
        </header>

        <div className="desk-tabs" role="tablist" aria-label="Desk sections" onKeyDown={onTabKeyDown}>
          {DESK_TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabButtons.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`desk-tab-${t.id}`}
              className="desk-tab"
              aria-selected={t.id === tab}
              aria-controls="desk-panel"
              tabIndex={t.id === tab ? 0 : -1}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="desk-panel" role="tabpanel" id="desk-panel" aria-labelledby={`desk-tab-${tab}`} tabIndex={0}>
          <DeskTicket.Provider value={ticket}>
            <Panel />
          </DeskTicket.Provider>
        </div>
      </motion.aside>
    </>
  );
}
