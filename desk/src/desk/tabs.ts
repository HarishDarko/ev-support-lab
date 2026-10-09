export type DeskTab = "queue" | "incident" | "handoff" | "kb" | "coverage" | "scorecard";

export const DESK_TABS: readonly { id: DeskTab; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "incident", label: "Incident" },
  { id: "handoff", label: "Handoff" },
  { id: "kb", label: "Knowledge base" },
  { id: "coverage", label: "Coverage" },
  { id: "scorecard", label: "Scorecard" },
];

export const isDeskTab = (value: string | null | undefined): value is DeskTab =>
  DESK_TABS.some((tab) => tab.id === value);
