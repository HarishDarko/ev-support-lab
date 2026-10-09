/** The five stages of the walkthrough, in order. Direction: docs/design/direction.md. */
export interface Stage {
  id: "queue" | "triage" | "evidence" | "verification" | "close";
  name: string;
  /** Clock time for the kicker, where the direction gives one. */
  clock?: string;
}

export const STAGES: readonly Stage[] = [
  { id: "queue", name: "Queue", clock: "07:00 ET" },
  { id: "triage", name: "Triage" },
  { id: "evidence", name: "Evidence" },
  { id: "verification", name: "Verification", clock: "Day 20" },
  { id: "close", name: "Close" },
];
