// The checks applied to model output (in checks.ts), plus the default pack's word lists and runbook exceptions,
// where the tests import them from.
import { DEFAULT_PACK } from "../../shared/packs";
import { exceptionIn, exceptionNamesIn } from "./checks";

export * from "./checks";
export type { RunbookExceptionRule } from "../../shared/packs/types";

const pack = DEFAULT_PACK;

export const COMPONENT_TERMS = pack.componentTerms;
export const RUNBOOK_TERMS = pack.runbookTerms;
export const RUNBOOK_FITS = pack.runbookFits;
export const RUNBOOK_EXCEPTIONS = pack.runbookExceptions;

/** The first exception that applies to a runbook for this ticket, or null. */
export const runbookException = (runbook: string, text: unknown, fw?: string) =>
  exceptionIn(pack.runbookExceptions, runbook, text, fw);
export const exceptionNames = (runbook: string): string[] => exceptionNamesIn(pack.runbookExceptions, runbook);
