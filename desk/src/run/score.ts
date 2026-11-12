// Triage accuracy: answers scored against the reviewed reference labels, field by field. Pure functions.
import labelsJson from "../../../docs/eval/reference-labels.json";
import { EV_DESK, type DeskPack } from "./pack";
import type { Run } from "./types";

export const SCORE_FIELDS = ["component", "severity", "action", "runbook"] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];

/** Every acceptable answer per field. The first is the reviewers' majority answer. */
export type ReferenceLabel = { id: string; why: string } & Record<ScoreField, string[]>;
export type TriageAnswer = { id: string } & Record<ScoreField, string>;

/** Lenient: any accepted answer counts. Strict: only the first (majority) answer counts. */
export type ScoreMode = "lenient" | "strict";

export interface TriageScore {
  /** Tickets that have both a label and an answer. */
  n: number;
  fields: Record<ScoreField, number>;
  /** Tickets with all four fields right. */
  allFour: number;
}

export const REFERENCE_LABELS: readonly ReferenceLabel[] = labelsJson.labels;
export const LABELS_REVIEWED: string = labelsJson.reviewed;

export function scoreTriage(
  labels: readonly ReferenceLabel[],
  answers: readonly TriageAnswer[],
  mode: ScoreMode = "lenient",
): TriageScore {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const fields: Record<ScoreField, number> = { component: 0, severity: 0, action: 0, runbook: 0 };
  let n = 0;
  let allFour = 0;
  for (const label of labels) {
    const answer = byId.get(label.id);
    if (!answer) continue;
    n += 1;
    let right = 0;
    for (const f of SCORE_FIELDS) {
      const accepted = mode === "strict" ? label[f].slice(0, 1) : label[f];
      if (accepted.includes(answer[f])) {
        fields[f] += 1;
        right += 1;
      }
    }
    if (right === SCORE_FIELDS.length) allFour += 1;
  }
  return { n, fields, allFour };
}

/** The triage answers in a run, as the desk shows them (after the guardrails and any rules fallback). */
export function triageAnswers(run: Run): TriageAnswer[] {
  return run.steps.triage.flatMap((batch) => batch.data.results);
}

/** The keyword rules' answers for the open queue. */
export function rulesAnswers(pack: DeskPack = EV_DESK): TriageAnswer[] {
  return pack.tickets.map((t) => pack.ruleTriage(t));
}

/**
 * The rules were written while looking at the open queue, so their score there is in-sample. This checks them on
 * the older closed tickets instead: does the rules' runbook match the one named in the real resolution?
 */
export function historyCheck(pack: DeskPack = EV_DESK): { same: number; n: number } {
  let same = 0;
  for (const h of pack.history) {
    const resolved = /^(RB-\d{2})/.exec(h.resolution)?.[1] ?? "none";
    if (pack.ruleTriage(h).runbook === resolved) same += 1;
  }
  return { same, n: pack.history.length };
}

/** The Wilson 95% interval for k right out of n, in whole percent. */
export function wilson95(k: number, n: number): [low: number, high: number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.round(Math.max(0, centre - half) * 100), Math.round(Math.min(1, centre + half) * 100)];
}
