// Numbers for the incident tab, all computed from the synthetic data.
import { HERO, RUNBOOKS, type FleetRow, type UnplugToDrop } from "../../data/synthetic";
import type { PatternModel } from "../../run/types";

/** Every stuck session dropped its connection within this many seconds of the unplug (the window the fleet view counts). */
export const DROP_WINDOW_SECONDS = 90;

/** The runbook that only corrects records: the one the repeat rule is about. */
export const RECORD_ONLY_RUNBOOK: string = RUNBOOKS.find((r) => r.recordOnly)?.id ?? "";

/** Stuck sessions sorted by seconds from unplug to drop. */
export const sortedTimings = (): UnplugToDrop[] => [...HERO.unplugToDropSec].sort((a, b) => a.s - b.s);

export const slowestDropSec = (): number => Math.max(...HERO.unplugToDropSec.map((g) => g.s));
export const fastestDropSec = (): number => Math.min(...HERO.unplugToDropSec.map((g) => g.s));

/** Stuck sessions per firmware line, e.g. { "FW-B": 12, "FW-A": 2 }. */
export function stuckByFirmware(): [string, number][] {
  const counts = new Map<string, number>();
  for (const g of HERO.unplugToDropSec) counts.set(g.fw, (counts.get(g.fw) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** Share of drops near unplug that ended stuck, as a whole percentage. */
export const stuckShare = (row: FleetRow): number =>
  row.dropsNearUnplug === 0 ? 0 : Math.round((row.stuck / row.dropsNearUnplug) * 100);

/**
 * The AI pattern that is the incident: the one holding the most held tickets, then the one with the most tickets
 * of the incident (the prototype's rule).
 */
export function incidentPattern(patterns: readonly PatternModel[], heldIds: readonly string[]): PatternModel | null {
  const incident = new Set([...HERO.openIds, ...HERO.historyIds]);
  const held = new Set(heldIds);
  const score = (p: PatternModel) =>
    p.ticket_ids.filter((id) => held.has(id)).length * 100 +
    [...p.ticket_ids, ...p.history_ids].filter((id) => incident.has(id)).length;
  return [...patterns].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Lines of a gateway log worth flagging, by what they say. */
export type LogFlag = "dropped" | "missing" | "ignored" | null;
export function logFlag(detail: string): LogFlag {
  if (/ignored/.test(detail)) return "ignored";
  if (/no TransactionEvent Ended received/.test(detail)) return "missing";
  if (/connection lost/.test(detail)) return "dropped";
  return null;
}
