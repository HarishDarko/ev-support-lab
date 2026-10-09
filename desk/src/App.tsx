import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MotionConfig } from "motion/react";
import { useTheme } from "./theme";
import { TopStrip, type Page } from "./components/TopStrip";
import { OperatingModel } from "./pages/OperatingModel";
import { EngineeringNotes } from "./pages/EngineeringNotes";
import { Board } from "./board/Board";
import { Claim, ControlBar, RunControl } from "./stage/Stage";
import { PhoneStory } from "./phone/PhoneStory";
import { DeskSheet } from "./desk/DeskSheet";
import { isDeskTab, type DeskTab } from "./desk/tabs";
import { RunProvider, liveSpendText, useRun } from "./run";
import { facts } from "./story/beats";
import { storyDataFromRun } from "./story/fromRun";
import { useStory } from "./story/useStory";
import { MeterGateContext } from "./story/meterGate";

const NARROW = "(max-width: 999px)";
const subscribe = (cb: () => void) => {
  const q = window.matchMedia(NARROW);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches);

/** `?desk=<tab>` opens the desk on that tab when the page loads, so a link can point straight at the console. */
const requestedTab = (): DeskTab | null => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("desk")) return null;
  const tab = params.get("desk");
  return isDeskTab(tab) ? tab : "queue";
};

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RunProvider>
        <Walkthrough />
      </RunProvider>
    </MotionConfig>
  );
}

function Walkthrough() {
  const { theme, toggle } = useTheme();
  const narrow = useNarrow();
  const runApi = useRun();
  // A link with ?desk=<tab> opens the console at once.
  const [linked] = useState(requestedTab);
  const [deskOpen, setDeskOpen] = useState(linked !== null);
  const [deskTab, setDeskTab] = useState<DeskTab>(linked ?? "queue");
  // When the desk opens from a link, the opener takes focus in the same commit, before the sheet records what
  // to return focus to on close.
  const deskButton = useCallback(
    (el: HTMLButtonElement | null) => {
      if (el && linked) el.focus();
    },
    [linked],
  );
  // The walkthrough, or one of the two reading pages beside it.
  const [page, setPage] = useState<Page>("walkthrough");
  const story = useStory(!deskOpen && !narrow && page === "walkthrough");

  const { run, resultFor } = runApi;
  const data = useMemo(() => storyDataFromRun({ run, resultFor }), [run, resultFor]);
  const f = facts(data, story.decisions);
  const { beat } = story;
  const meterGate = useMemo(
    () => ({ checked: new Set(story.decisions.meterChecked), confirm: story.confirmMeter }),
    [story.decisions.meterChecked, story.confirmMeter],
  );
  const actionPending = (beat.action === "approve" && !f.approved) || (beat.action === "send" && !f.sent);

  const [deskTicket, setDeskTicket] = useState<string | null>(null);
  const openDesk = useCallback((tab: DeskTab, ticket: string | null = null) => {
    setDeskTicket(ticket);
    setDeskTab(tab);
    setDeskOpen(true);
  }, []);

  // D opens the desk on the tab that holds this beat's evidence.
  useEffect(() => {
    if (deskOpen || page !== "walkthrough") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key !== "d" && e.key !== "D") return;
      e.preventDefault();
      openDesk(beat.desk);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deskOpen, page, beat.desk, openDesk]);

  // On a phone the stage in view drives the top strip, and the strip scrolls to a stage.
  const [phoneStage, setPhoneStage] = useState(0);
  const [jumpTo, setJumpTo] = useState<{ stageIndex: number; n: number } | null>(null);
  const onPhoneStage = useCallback((i: number) => setPhoneStage(i), []);
  const onStage = (i: number) => {
    setPage("walkthrough");
    if (narrow) setJumpTo((j) => ({ stageIndex: i, n: (j?.n ?? 0) + 1 }));
    else story.goStage(i);
  };
  const onPage = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  const aiLabel =
    runApi.source === "live"
      ? liveSpendText(runApi.spent, runApi.unpriced)
      : run.recording.source === "ai"
        ? "AI · recorded run"
        : "Rules · recorded run";

  return (
    <>
      <a className="skip-link" href="#stage">
        Skip to the stage
      </a>
      <TopStrip
        stageIndex={narrow ? phoneStage : story.stageIndex}
        onStage={onStage}
        theme={theme}
        onToggleTheme={toggle}
        aiLabel={aiLabel}
        onAi={() => openDesk("scorecard")}
        page={page}
        onPage={onPage}
      />
      <main
        id="stage"
        className="story"
        tabIndex={-1}
        data-beat={narrow || page !== "walkthrough" ? undefined : beat.id}
      >
        {page === "operating" ? (
          <OperatingModel />
        ) : page === "notes" ? (
          <EngineeringNotes />
        ) : narrow ? (
          <PhoneStory
            data={data}
            f={f}
            onApprove={() => story.approve(f.approvable)}
            onSend={story.send}
            onDesk={(b) => openDesk(b.desk)}
            onStageInView={onPhoneStage}
            jumpTo={jumpTo}
          />
        ) : (
          <>
            <Claim
              beat={beat}
              f={f}
              stageIndex={story.stageIndex}
              onApprove={() => story.approve(f.approvable)}
              onSend={story.send}
              extra={
                beat.id === "t1" ? (
                  <RunControl api={runApi} />
                ) : beat.id === "q1" ? (
                  <p className="engineering-hint">
                    <button type="button" className="btn btn--small" onClick={() => onPage("notes")}>
                      Engineering view: how this was built, and what it does not prove
                    </button>
                  </p>
                ) : undefined
              }
            />
            <Board at={story.index} beat={beat.id} data={data} f={f} onOpenTicket={(id) => openDesk("queue", id)} />
          </>
        )}
      </main>
      {!narrow && page === "walkthrough" && (
        <ControlBar
          index={story.index}
          actionPending={actionPending}
          onBack={story.back}
          onNext={story.next}
          onDesk={() => openDesk(beat.desk)}
          deskRef={deskButton}
        />
      )}
      <MeterGateContext.Provider value={meterGate}>
        <DeskSheet
          open={deskOpen}
          tab={deskTab}
          ticket={deskTicket}
          onClose={() => setDeskOpen(false)}
          onTab={setDeskTab}
        />
      </MeterGateContext.Provider>
    </>
  );
}
